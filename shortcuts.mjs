// Resolve practice commands without consuming letters while the learner is typing.
export function practiceShortcut(event, { auxiliary = '', finished = false, choice = false } = {}) {
  if (event.isComposing || event.repeat || event.altKey || event.metaKey) return null;
  const key = event.key;
  if (event.ctrlKey) {
    return key === 'Enter' && !event.shiftKey && auxiliary === 'extend' ? 'add' : null;
  }
  if (key === 'Enter') {
    if (event.shiftKey) return auxiliary === 'extend' || (!auxiliary && !finished) ? 'skip' : null;
    return auxiliary ? 'aux-next' : finished ? 'next' : choice ? null : 'submit';
  }
  if (auxiliary) return null;
  if (key === 'PageUp' && !event.shiftKey) return 'previous';
  if (!finished) {
    return choice && !event.shiftKey && /^[1-4]$/.test(key) ? `choose-${key}` : null;
  }
  if (key === ' ' && !event.shiftKey) return 'next';
  if (key.toLowerCase() === 'e') return event.shiftKey ? 'extend-all' : 'extend-family';
  if (event.shiftKey) return null;
  return { r: 'repeat', f: 'favorite', p: 'audio' }[key.toLowerCase()] || null;
}
