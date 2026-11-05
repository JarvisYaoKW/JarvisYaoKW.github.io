"""读取 WordNet 3.0 与 ECDICT，生成预置词族；只写词典资料，不读取或修改学习进度。

使用 WordNet 的词级派生关系和副词→形容词关系，不按相似拼写、近义词或词尾猜词。
中文释义、词性和音标取自 ECDICT；英文释义取自实际关联的 WordNet 义项。
"""

import argparse
import csv
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from family_graph import lexical_graph, expand_families

POS = {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}
MARK = {"noun": "n.", "verb": "v.", "adjective": "adj.", "adverb": "adv."}
ABBR = {"n": "noun", "v": "verb", "vt": "verb", "vi": "verb", "aux": "verb", "a": "adjective", "adj": "adjective", "adv": "adverb"}
POS_RE = re.compile(r"\b(adj|adv|vt|vi|aux|prep|pron|conj|interj|det|art|num|n|v|a)\.\s*", re.I)
RESTRICTED = re.compile(r"(?:^|[\[(（【])\s*(?:obsolete|archaic|dated|rare|古|旧|废|罕)|\b(?:obsolete|archaic)\b", re.I)
WORD = re.compile(r"[a-z]+(?:-[a-z]+)*\Z")


def meanings_by_pos(values):
    result = defaultdict(list)
    for value in values:
        matches = list(POS_RE.finditer(value))
        for i, match in enumerate(matches):
            pos = ABBR.get(match[1].lower())
            text = value[match.end():matches[i + 1].start() if i + 1 < len(matches) else None].strip(" ;；\n")
            if pos and '\ufffd' not in text and re.search(r"[\u3400-\u9fff]", text) and not RESTRICTED.search(text):
                if text not in result[pos]:
                    result[pos].append(text)
    return result


def synsets(archive):
    result = {}
    for suffix in ["noun", "verb", "adj", "adv"]:
        for line in archive.read("wordnet/data." + suffix).decode("utf-8").splitlines():
            if not line or not line[0].isdigit():
                continue
            body, gloss = line.split(" | ", 1)
            tokens = body.split()
            count = int(tokens[3], 16)
            words = [re.sub(r"\((?:p|a|ip)\)$", "", tokens[4 + 2 * i]).replace("_", " ") for i in range(count)]
            index = 4 + 2 * count
            pointer_count = int(tokens[index])
            pointers = [tokens[index + 1 + 4 * i:index + 5 + 4 * i] for i in range(pointer_count)]
            result[(tokens[2].replace("s", "a"), tokens[0])] = {"pos": POS[tokens[2]], "words": words, "pointers": pointers, "definition": gloss.strip()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordnet", required=True, type=Path)
    parser.add_argument("--ecdict", required=True, type=Path)
    parser.add_argument("--ipa-us", type=Path, help="可选：ipa-dict en_US.txt，仅补缺失且无多读音歧义的音标")
    parser.add_argument("--ipa-license", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "wordbooks")
    args = parser.parse_args()
    books = json.loads((args.out / "catalog.json").read_text(encoding="utf-8"))["books"]
    roots = defaultdict(set)
    book_keys = {}
    for book in books:
        rows = json.loads((args.out / Path(book["file"]).name).read_text(encoding="utf-8"))["rows"]
        book_keys[book["id"]] = [row["english"].strip().lower() for row in rows]
        for row in rows:
            roots[row["english"].strip().lower()].update(meanings_by_pos(row["meanings"]))

    archive = zipfile.ZipFile(args.wordnet)
    nodes = synsets(archive)
    graph, sense_definitions, links = lexical_graph(nodes)
    # Also expose complete families when entering through a non-preset member.
    needed = {state[0] for state in graph}
    dictionary = {}
    with args.ecdict.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if row["word"] not in needed:
                continue
            senses = meanings_by_pos(row["translation"].replace("\\n", "\n").splitlines())
            rank = min([int(row[k]) for k in ["bnc", "frq"] if row[k].isdigit() and int(row[k]) > 0] or [999999])
            common = rank <= 50000 or bool(row["collins"].strip("0")) or row["oxford"] == "1" or row["word"] in roots
            dictionary[row["word"]] = {"senses": senses, "phonetic": row["phonetic"], "rank": rank, "common": common}

    # Small editorial repair for a source entry whose Chinese bytes are corrupted.
    # Its existence and relation are independently evidenced by WordNet/Wiktionary.
    dictionary['creator'] = dict(senses={'noun': ['创造者；创作者']}, phonetic='', rank=10000, common=True, meaningSource='编写释义 · 词典义项核对')
    preset_roots = dict(roots)
    for word, record in dictionary.items():
        roots[word].update(record['senses'])
    entries, members, links = expand_families(roots, dictionary, graph, sense_definitions, links, MARK)
    relations = Counter(edge['relation'] for row in entries.values() for edge in row)

    ipa_filled = 0
    if args.ipa_us:
        if not args.ipa_license:
            parser.error("--ipa-us requires --ipa-license")
        ipa = {}
        for line in args.ipa_us.read_text(encoding="utf-8").splitlines():
            if "\t" not in line:
                continue
            word, readings = line.split("\t", 1)
            pronunciations = set(re.findall(r"/([^/]+)/", readings))
            if len(pronunciations) == 1:
                ipa[word] = next(iter(pronunciations))
        for member in members.values():
            if not member["phonetic"] and member["word"] in ipa:
                member.update(phonetic=ipa[member["word"]], phoneticAccent="us", phoneticSource="ipa-dict en_US · MIT")
                ipa_filled += 1
        (args.out / "IPA-DICT-LICENSE.txt").write_bytes(args.ipa_license.read_bytes())

    output = {"schema": 1, "version": "20261104-2", "sources": {"relations": "Princeton WordNet 3.0", "meanings": "ECDICT · MIT"}, "entries": entries, "members": dict(sorted(members.items())), "links": links}
    encoded = (json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    (args.out / "families.json").write_bytes(encoded)
    # Browser loads only the current initial's shard, not the entire audit dataset.
    shard_dir = args.out / 'families'
    shard_dir.mkdir(exist_ok=True)
    for letter in 'abcdefghijklmnopqrstuvwxyz':
        selected = {word: row for word, row in entries.items() if word.startswith(letter)}
        ids = {edge['member'] for row in selected.values() for edge in row}
        shard = {**output, 'entries': selected, 'members': {identifier: members[identifier] for identifier in sorted(ids)}, 'links': {}}
        (shard_dir / (letter + '.json')).write_bytes((json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
    (args.out / "WordNet-LICENSE.txt").write_bytes(archive.read("wordnet/LICENSE"))
    report = {"version": output["version"], "rootCount": len(preset_roots), "coveredRoots": sum(word in entries for word in preset_roots), "indexedRoots": len(entries), "members": len(members), "relations": dict(relations), "relationCount": sum(relations.values()), "adjectiveRootsWithAdverbs": sum(any(edge["rootPos"] == "adjective" and members[edge["member"]]["pos"] == "adverb" for edge in row) for row in entries.values()), "books": {key: {"words": len(words), "coveredRoots": sum(word in entries for word in words)} for key, words in book_keys.items()}, "sources": [{"url": "https://raw.githubusercontent.com/nltk/nltk_data/96f9b3252457a2b97e52aec64c3dfceeb5c312d5/packages/corpora/wordnet.zip", "sha256": hashlib.sha256(args.wordnet.read_bytes()).hexdigest()}, {"url": "https://raw.githubusercontent.com/skywind3000/ECDICT/9c46923fb81a2eb6c264a3a1689562ea7bc56b6a/ecdict.csv", "sha256": hashlib.sha256(args.ecdict.read_bytes()).hexdigest()}], "outputSHA256": hashlib.sha256(encoded).hexdigest(), "filters": ["explicit lexical derivation or adverb/adjective pointer", "current source POS", "matching Chinese target POS", "all POS-matched Chinese senses; frequency marks common members", "sense-specific multi-step paths; no fixed member-count truncation", "explicit prefix-antonym pairs and morphologically matching pertainyms; no synonym edges or invented words"]}
    report["ipaFilledFromUS"] = ipa_filled
    report['presetRelationCount'] = sum(len(entries.get(word, [])) for word in preset_roots)
    report['presetAdjectiveRootsWithAdverbs'] = sum(any(edge['rootPos'] == 'adjective' and members[edge['member']]['pos'] == 'adverb' for edge in entries.get(word, [])) for word in preset_roots)
    report['maxMembersPerRoot'] = max(map(len, entries.values()))
    report["missingIPA"] = sorted({member["word"] for member in members.values() if not member["phonetic"]})
    if args.ipa_us:
        report["sources"].append({"url": "https://raw.githubusercontent.com/open-dict-data/ipa-dict/44accfb5b0c4c7c146e666c9c7161a5b66e61720/data/en_US.txt", "sha256": hashlib.sha256(args.ipa_us.read_bytes()).hexdigest()})
    (args.out / "families-lock.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["rootCount", "coveredRoots", "members", "relationCount", "adjectiveRootsWithAdverbs", "books"]}, ensure_ascii=False, indent=2))
    for root in ["clear", "happy", "vulnerable", "applicable", "apply", "character", "friendly", "hard", "economic"]:
        print(root, [(edge["rootPos"], edge["member"]) for edge in entries.get(root, [])])


if __name__ == "__main__":
    main()
