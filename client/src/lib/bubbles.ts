export function splitBubbles(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface StreamingBubbles {
  complete: string[];
  current: string | null;
}

export function splitStreaming(text: string): StreamingBubbles {
  const normalised = text.replace(/\r\n/g, '\n');
  const parts = normalised.split(/\n[ \t]*\n+/);
  const last = parts.pop() ?? '';
  const complete = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  const current = last.trim();
  return { complete, current: current.length > 0 ? current : null };
}
