//! Native Windows probes. No shell commands or external executables required.
use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
    TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetProcessHandleCount, GetProcessTimes, GetSystemTimes, OpenProcess,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

fn ticks(time: FILETIME) -> u64 {
    (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime)
}

/// Process time excludes children and uses the same microsecond units as rusage.
pub(crate) fn self_cpu_us() -> Option<(i64, i64)> {
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: Valid current-process pseudo-handle and writable FILETIME outputs.
    let ok = unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut created,
            &mut exited,
            &mut kernel,
            &mut user,
        )
    };
    (ok != 0).then(|| ((ticks(user) / 10) as i64, (ticks(kernel) / 10) as i64))
}

#[derive(Clone, Copy)]
struct SystemTimes {
    idle: u64,
    total: u64,
}

impl SystemTimes {
    fn now() -> Option<Self> {
        let mut idle = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        // SAFETY: Each pointer refers to a writable FILETIME.
        if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
            return None;
        }
        Some(Self {
            idle: ticks(idle),
            total: ticks(kernel).saturating_add(ticks(user)),
        })
    }

    fn utilization_since(self, prev: Self) -> f64 {
        let total = self.total.saturating_sub(prev.total);
        if total == 0 {
            return 0.0;
        }
        // GetSystemTimes kernel time INCLUDES idle; subtract idle once.
        let busy = total.saturating_sub(self.idle.saturating_sub(prev.idle));
        (busy as f64 / total as f64).clamp(0.0, 1.0)
    }
}

/// Cached once per second across ALL terminal tickers. Windows has no Unix run
/// queue load average; >=90% processor utilization is our saturation threshold.
pub(crate) fn system_load_ratio() -> f64 {
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};
    static SAMPLE: OnceLock<parking_lot::Mutex<(Option<SystemTimes>, Instant, f64)>> =
        OnceLock::new();
    let mut sample = SAMPLE
        .get_or_init(|| parking_lot::Mutex::new((SystemTimes::now(), Instant::now(), 0.0)))
        .lock();
    if sample.1.elapsed() >= Duration::from_secs(1) {
        if let Some(now) = SystemTimes::now() {
            sample.2 = sample
                .0
                .map_or(0.0, |prev| now.utilization_since(prev) / 0.9);
            sample.0 = Some(now);
        }
        sample.1 = Instant::now();
    }
    sample.2
}

pub(crate) fn handle_count() -> usize {
    let mut count = 0;
    // SAFETY: Current-process pseudo-handle; valid writable counter.
    if unsafe { GetProcessHandleCount(GetCurrentProcess(), &mut count) } != 0 {
        count as usize
    } else {
        0
    }
}

pub(crate) fn thread_count() -> usize {
    // SAFETY: Snapshot is checked, entry initialized with its required size,
    // and the owned snapshot handle is closed on every path.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return 0;
        }
        let mut entry = THREADENTRY32 {
            dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };
        let mut count = 0;
        let mut ok = Thread32First(snapshot, &mut entry);
        while ok != 0 {
            if entry.th32OwnerProcessID == std::process::id() {
                count += 1;
            }
            ok = Thread32Next(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        count
    }
}

/// Lifetime-average CPU of direct children, matching the Unix `ps %cpu` probe.
pub(crate) fn children() -> Vec<(u32, String, Option<f64>)> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut children = Vec::new();
        let mut ok = Process32FirstW(snapshot, &mut entry);
        while ok != 0 {
            if entry.th32ParentProcessID == std::process::id() {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..end]);
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
                let cpu = if handle.is_null() {
                    None
                } else {
                    let mut created = FILETIME::default();
                    let mut exited = FILETIME::default();
                    let mut kernel = FILETIME::default();
                    let mut user = FILETIME::default();
                    let ok =
                        GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user);
                    CloseHandle(handle);
                    if ok == 0 {
                        None
                    } else {
                        let mut now = FILETIME::default();
                        windows_sys::Win32::System::SystemInformation::GetSystemTimeAsFileTime(
                            &mut now,
                        );
                        let elapsed = ticks(now).saturating_sub(ticks(created));
                        (elapsed > 0)
                            .then(|| (ticks(kernel) + ticks(user)) as f64 / elapsed as f64 * 100.0)
                    }
                };
                children.push((entry.th32ProcessID, name, cpu));
            }
            ok = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        children
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_utilization_subtracts_idle_and_handles_reset() {
        let prev = SystemTimes {
            idle: 100,
            total: 1000,
        };
        assert!(
            (SystemTimes {
                idle: 150,
                total: 1100
            }
            .utilization_since(prev)
                - 0.5)
                .abs()
                < f64::EPSILON
        );
        assert!(
            (SystemTimes {
                idle: 200,
                total: 1100
            }
            .utilization_since(prev)
                - 0.0)
                .abs()
                < f64::EPSILON
        );
        assert!(
            (SystemTimes {
                idle: 100,
                total: 1100
            }
            .utilization_since(prev)
                - 1.0)
                .abs()
                < f64::EPSILON
        );
        assert!(
            (SystemTimes { idle: 0, total: 0 }.utilization_since(prev) - 0.0).abs() < f64::EPSILON
        );
    }

    #[test]
    fn native_self_probes_are_available() {
        let (user, kernel) = self_cpu_us().expect("Windows CPU sample");
        assert!(user >= 0 && kernel >= 0);
        assert!(handle_count() > 0);
        assert!(thread_count() > 0);
        assert!(SystemTimes::now().is_some());
    }
}
