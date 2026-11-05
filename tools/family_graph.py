"""按 WordNet 的词级义项遍历派生链；不跨同义词或同形异义项跳转。"""
from collections import defaultdict, deque
from os.path import commonprefix
import re

WORD = re.compile(r"[a-z]+(?:-[a-z]+)*\Z")
IRREGULAR = {frozenset(pair) for pair in [('long','length'),('wide','width'),('high','height'),('deep','depth'),('broad','breadth'),('young','youth'),('choose','choice'),('see','sight')]}
PREFIXES = ('un', 'non', 'dis', 'in', 'im', 'il', 'ir', 'de', 'mis')


def prefixed(a, b):
    return any(a == p + b or b == p + a for p in PREFIXES)


def lexical_graph(nodes):
    graph, senses, links = defaultdict(list), {}, {}
    seen = set()

    def connect(a, b, relation):
        if (a[0] != b[0] and not prefixed(a[0], b[0]) and len(commonprefix([a[0], b[0]])) < 3 and frozenset([a[0], b[0]]) not in IRREGULAR) or not WORD.fullmatch(a[0]) or not WORD.fullmatch(b[0]):
            return
        for source, target in [(a, b), (b, a)]:
            pair = (source, target, relation)
            if pair in seen:
                continue
            seen.add(pair)
            identifier = str(len(links))
            links[identifier] = dict(source=source[0] + '#' + source[1], target=target[0] + '#' + target[1], fromSense=source[2], toSense=target[2], relation=relation)
            graph[source].append((target, identifier))

    for (part, offset), node in nodes.items():
        for word in node['words']:
            senses[(word, node['pos'], part + offset)] = node['definition']
        for symbol, offset2, part2, indices in node['pointers']:
            other = nodes.get((part2.replace('s', 'a'), offset2))
            if not other:
                continue
            i, j = int(indices[:2], 16), int(indices[2:], 16)
            relation = ('derivation' if symbol == '+' else
                        'adverb-adjective' if symbol == '\\' and node['pos'] == 'adverb' else
                        'pertainym' if symbol == '\\' and node['pos'] == 'adjective' else
                        'prefix' if symbol == '!' else None)
            if not relation or (relation != 'prefix' and (not i or not j)):
                continue
            left = [node['words'][i - 1]] if i else node['words']
            right = [other['words'][j - 1]] if j else other['words']
            for a in left:
                for b in right:
                    if relation == 'prefix' and not prefixed(a, b):
                        continue
                    if relation == 'pertainym' and len(commonprefix([a, b])) < 3:
                        continue
                    connect((a, node['pos'], part + offset), (b, other['pos'], part2.replace('s', 'a') + offset2), relation)
    # Independently reviewed bridges for gaps in WordNet's derivational pointers.
    # Only the relationship is recorded; meanings remain the licensed dictionary data.
    reviewed = [('act', 'verb', 'active', 'adjective', 'https://en.wiktionary.org/wiki/act#English'),
                ('active', 'adjective', 'activate', 'verb', 'https://en.wiktionary.org/wiki/active#English'),
                ('create', 'verb', 'creator', 'noun', 'https://en.wiktionary.org/wiki/creator#English')]
    for word, pos, word2, pos2, url in reviewed:
        left = [state for state in senses if state[:2] == (word, pos)]
        right = [state for state in senses if state[:2] == (word2, pos2)]
        if left and right:
            before = len(links)
            connect(left[0], right[0], 'reviewed-family')
            for identifier in list(links)[before:]:
                links[identifier]['sourceUrl'] = url
    return graph, senses, links


def expand_families(roots, dictionary, graph, senses, links, marks):
    starts = defaultdict(list)
    for state in graph:
        if state[0] in roots and state[1] in roots[state[0]]:
            starts[(state[0], state[1])].append(state)

    entries, members, used_links = {}, {}, {}
    for root in sorted(roots):
        selected = {}
        for root_pos in sorted(roots[root]):
            seeds = starts[(root, root_pos)]
            queue = deque((state, [], [root]) for state in seeds)
            visited = set(seeds)
            while queue:
                state, path, via = queue.popleft()
                for target, identifier in graph[state]:
                    if target in visited:
                        continue
                    visited.add(target)
                    word, pos, sense = target
                    record = dictionary.get(word)
                    # Every intermediate word must have a matching Chinese POS too.
                    if not record or pos not in record['senses']:
                        continue
                    steps, route = path + [identifier], via + [word]
                    queue.append((target, steps, route))
                    if word == root:
                        continue
                    member_id = word + '#' + pos
                    member = members.setdefault(member_id, dict(word=word, pos=pos, meaning=marks[pos] + ' ' + '；'.join(record['senses'][pos]), phonetic=record['phonetic'], common=record['common'], meaningSource=record.get('meaningSource', 'ECDICT · MIT'), englishDefinitions=[]))
                    definition = dict(pos=pos, definition=senses[target])
                    if definition not in member['englishDefinitions']:
                        member['englishDefinitions'].append(definition)
                    signature = (root_pos, member_id)
                    if signature in selected and len(selected[signature]['path']) <= len(steps):
                        continue
                    for step in steps:
                        used_links[step] = links[step]
                    selected[signature] = dict(member=member_id, rootPos=root_pos, relation=links[identifier]['relation'] if len(steps) == 1 else 'multi-step', evidence=[dict(fromSense=links[steps[0]]['fromSense'], toSense=sense)], path=steps, via=route)
        if selected:
            entries[root] = sorted(selected.values(), key=lambda edge: (not members[edge['member']]['common'], len(edge['path']), members[edge['member']]['pos'] != 'adverb', dictionary[members[edge['member']]['word']]['rank'], edge['member'], edge['rootPos']))
    return entries, members, used_links
