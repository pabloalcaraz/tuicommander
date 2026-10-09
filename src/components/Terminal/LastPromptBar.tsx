import { type Accessor, type Component, createSignal } from "solid-js";
import { appLogger } from "../../stores/appLogger";
import { cx } from "../../utils";
import { writeClipboard } from "../../utils/clipboard";
import s from "./LastPromptBar.module.css";

export interface LastPromptBarProps {
	prompt: Accessor<string | null>;
}

const Chevron = () => (
	<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
		<path
			d="M2 3.5l3 3 3-3"
			fill="none"
			stroke="currentColor"
			stroke-width="1.3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
);

export const LastPromptBar: Component<LastPromptBarProps> = (props) => {
	const [expanded, setExpanded] = createSignal(false);
	const [copyStatus, setCopyStatus] = createSignal("Copy prompt");
	const copy = async () => {
		try {
			await writeClipboard(props.prompt() ?? "");
			setCopyStatus("Copied");
		} catch (err) {
			setCopyStatus("Copy failed — try again");
			appLogger.warn("terminal", "Could not copy last prompt", { error: String(err) });
		}
	};

	const toggle = (e: MouseEvent) => {
		e.stopPropagation();
		setExpanded((v) => !v);
	};

	return (
		<div class={cx(s.bar, expanded() ? s.expanded : s.collapsed)}>
			<div class={s.header}>
				<button
					type="button"
					class={s.toggle}
					onClick={toggle}
					aria-expanded={expanded()}
					aria-label="Toggle last prompt"
				>
					<span class={s.label}>Prompt</span>
					<span class={s.preview}>{expanded() ? "" : props.prompt()}</span>
					<span class={cx(s.chevron, expanded() && s.chevronUp)}>
						<Chevron />
					</span>
				</button>
				<button type="button" class={s.copy} onClick={copy} title={copyStatus()} aria-label="Copy last prompt">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
						<path d="M5 1h8a1 1 0 0 1 1 1v8h-1V2H5V1zm-3 3h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v9h8V5H2z" />
					</svg>
				</button>
			</div>
			{expanded() && <div class={s.body}>{props.prompt()}</div>}
		</div>
	);
};
