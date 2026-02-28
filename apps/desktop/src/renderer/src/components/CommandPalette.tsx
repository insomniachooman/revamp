import { useEffect, useMemo, useState } from "react";

type Command = {
  label: string;
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onExecuted: () => void;
  commands: Command[];
};

export function CommandPalette({ open, onClose, onExecuted, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()));
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, filteredCommands.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          command.run();
          onExecuted();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredCommands, onClose, onExecuted, open, selectedIndex]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-card" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="text-input"
          placeholder="Search commands"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="palette-list">
          {filteredCommands.map((command, index) => (
            <button
              key={command.label}
              className={`palette-item ${selectedIndex === index ? "active" : ""}`}
              onClick={() => {
                command.run();
                onExecuted();
              }}
            >
              {command.label}
            </button>
          ))}
          {filteredCommands.length === 0 && <p className="tiny-note">No command matches your search.</p>}
        </div>
      </div>
    </div>
  );
}

