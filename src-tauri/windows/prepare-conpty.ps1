param(
    [ValidateSet('x86_64-pc-windows-msvc', 'i686-pc-windows-msvc', 'aarch64-pc-windows-msvc')]
    [string]$TargetTriple = 'x86_64-pc-windows-msvc',
    [string]$BinariesDir = (Join-Path $PSScriptRoot '../binaries'),
    # Offline input for verification; subject to the same pinned checksum.
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$version = '1.24.260710001'
$packageHash = '175640566A3B59C4B132070EE96C2C77E5AB7EDD2E92732A5EB3610BBF63D90E'
$assets = switch ($TargetTriple) {
    'x86_64-pc-windows-msvc' { @{
        Arch = 'x64'
        Dll = '39FBA2713E2495117B1591AE8C32A3B904BEA7AA66069CF7815E2844C76D75D8'
        Exe = 'B7FD936C2668B87B9ECF7B3366DC6568AFC1C6F981874CBA3E955A1C35CF8160'
    } }
    'i686-pc-windows-msvc' { @{
        Arch = 'x86'
        Dll = '11C4D8B3015E593F9F9F6872500BD37A076517CB33092422571C0A28BBD25347'
        Exe = '7C199EA9DB18C2F99E2EC2DC339A0FD4D8441ADEDF4589A0C7508BB492066C65'
    } }
    'aarch64-pc-windows-msvc' { @{
        Arch = 'arm64'
        Dll = 'DB3D173640B172BAFD42D5B541B638A9AEEC1C7D0E40DD636BF02822A32C912C'
        Exe = 'ED7622FD0D3BEDC9AB9F122F5E58EDF0DEF9E7999224F52DD395BA9F54EDBE09'
    } }
}
$files = @(
    @{ Entry = "runtimes/win-$($assets.Arch)/native/conpty.dll"; Name = 'conpty.dll'; Hash = $assets.Dll },
    @{ Entry = "build/native/runtimes/$($assets.Arch)/OpenConsole.exe"; Name = "OpenConsole-$TargetTriple.exe"; Hash = $assets.Exe }
)

$ready = $true
foreach ($file in $files) {
    $path = Join-Path $BinariesDir $file.Name
    if (!(Test-Path -LiteralPath $path -PathType Leaf) -or
        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $file.Hash) {
        $ready = $false
    }
}
if ($ready) {
    Write-Output "ConPTY $version ($($assets.Arch)) already verified"
    exit 0
}

$download = $null
$archive = $null
$staged = @()
try {
    if (!$ArchivePath) {
        $download = [System.IO.Path]::GetTempFileName()
        $ArchivePath = $download
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $url = "https://api.nuget.org/v3-flatcontainer/microsoft.windows.console.conpty/$version/microsoft.windows.console.conpty.$version.nupkg"
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $ArchivePath -TimeoutSec 60
    }
    if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash -ne $packageHash) {
        throw 'ConPTY package checksum mismatch; refusing to extract'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead([System.IO.Path]::GetFullPath($ArchivePath))
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetFullPath($BinariesDir)) | Out-Null
    foreach ($file in $files) {
        $entry = $archive.GetEntry($file.Entry)
        if (!$entry) { throw "ConPTY package is missing $($file.Entry)" }
        $temporary = Join-Path $BinariesDir ($file.Name + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
        $staged += @{ Temp = $temporary; Dest = (Join-Path $BinariesDir $file.Name) }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $temporary, $false)
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $file.Hash) {
            throw "ConPTY binary checksum mismatch: $($file.Name)"
        }
    }
    foreach ($file in $staged) { Move-Item -LiteralPath $file.Temp -Destination $file.Dest -Force }
    Write-Output "Prepared ConPTY $version ($($assets.Arch))"
} finally {
    if ($archive) { $archive.Dispose() }
    foreach ($file in $staged) {
        if (Test-Path -LiteralPath $file.Temp) { Remove-Item -LiteralPath $file.Temp -Force }
    }
    if ($download -and (Test-Path -LiteralPath $download)) { Remove-Item -LiteralPath $download -Force }
}
