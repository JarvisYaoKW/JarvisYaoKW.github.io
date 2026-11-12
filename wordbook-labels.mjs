const title = '很出名的某一本词汇书';
const previousShortTitle = '\u8bcd\u6c47\u771f\u7ecf';
const previousTitle = '雅思' + previousShortTitle;
const bookId = 'ielts-vocabulary-scripture';

function renameGroup(group) {
  if (group === previousTitle || group === previousShortTitle || group === 'lhb · ' + previousTitle)
    return title;
  const prefix = previousShortTitle + ' · ';
  return group?.startsWith?.(prefix) ? title + ' · ' + group.slice(prefix.length) : group;
}

export function updateWordbookLabels(state) {
  let changed = false;
  const updateGroup = (item) => {
    if (!item) return;
    const group = renameGroup(item.group);
    if (group !== item.group) {
      item.group = group;
      changed = true;
    }
  };
  const updateGroups = (item) => {
    if (!Array.isArray(item.groups)) return;
    const groups = item.groups.map(renameGroup);
    if (groups.some((group, index) => group !== item.groups[index])) {
      item.groups = [...new Set(groups)];
      changed = true;
    }
  };
  updateGroups(state);
  updateGroup(state.settings);
  updateGroup(state.daily?.config);
  updateGroup(state.daily?.task?.config);
  const installed = state.builtinBooks?.[bookId];
  updateGroup(installed);
  if (installed?.version === '20261028-1') {
    installed.version = '20261111-labels';
    changed = true;
  }
  for (const entry of Object.values(state.entries || {})) {
    updateGroups(entry);
    if (entry.source?.includes?.(previousShortTitle)) {
      entry.source = entry.source
        .split('；')
        .filter((part) => !part.includes(previousShortTitle))
        .join('；');
      changed = true;
    }
    if (entry.supplement?.bookSource?.title?.includes?.(previousShortTitle)) {
      delete entry.supplement.bookSource;
      changed = true;
    }
  }
  return changed;
}
