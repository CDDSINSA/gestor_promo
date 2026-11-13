import React from "react";

export default function EditableGridInput({ value, onCommit, onKeyDown, ...inputProps }) {
  const sourceValue = String(value ?? "");
  const [draft, setDraft] = React.useState(sourceValue);
  const sourceValueRef = React.useRef(sourceValue);
  const draftRef = React.useRef(sourceValue);

  React.useEffect(() => {
    sourceValueRef.current = sourceValue;
    draftRef.current = sourceValue;
    setDraft(sourceValue);
  }, [sourceValue]);

  const commitDraft = React.useCallback(() => {
    const nextValue = draftRef.current;
    if (nextValue === sourceValueRef.current) return;
    sourceValueRef.current = nextValue;
    onCommit(nextValue);
  }, [onCommit]);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    draftRef.current = nextValue;
    setDraft(nextValue);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      commitDraft();
    } else if (event.key === "Escape") {
      draftRef.current = sourceValueRef.current;
      setDraft(sourceValueRef.current);
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  };

  return <input {...inputProps} value={draft} onChange={handleChange} onBlur={commitDraft} onKeyDown={handleKeyDown} />;
}
