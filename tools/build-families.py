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
            if pos and re.search(r"[\u3400-\u9fff]", text) and not RESTRICTED.search(text):
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
    edges = defaultdict(dict)

    def add(word, root_pos, target, pos, relation, source_id, target_id, definition):
        if word not in roots or root_pos not in roots[word] or target == word:
            return
        if not WORD.fullmatch(word) or not WORD.fullmatch(target):
            return
        entry = edges[word].setdefault((root_pos, target, pos), {"rootPos": root_pos, "word": target, "pos": pos, "relation": relation, "evidence": [], "definitions": []})
        evidence = {"from": source_id, "to": target_id}
        if evidence not in entry["evidence"]:
            entry["evidence"].append(evidence)
        if definition not in entry["definitions"]:
            entry["definitions"].append(definition)

    for (part, offset), node in nodes.items():
        for symbol, target_offset, target_part, indices in node["pointers"]:
            if not (symbol == "+" or (symbol == "\\" and node["pos"] == "adverb")):
                continue
            source_index, target_index = int(indices[:2], 16), int(indices[2:], 16)
            target_node = nodes.get((target_part.replace("s", "a"), target_offset))
            if not source_index or not target_index or not target_node:
                continue
            word, target = node["words"][source_index - 1], target_node["words"][target_index - 1]
            relation = "adverb-adjective" if symbol == "\\" else "derivation"
            add(word, node["pos"], target, target_node["pos"], relation, part + offset, target_part + target_offset, target_node["definition"])
            add(target, target_node["pos"], word, node["pos"], relation, target_part + target_offset, part + offset, node["definition"])

    needed = {edge["word"] for row in edges.values() for edge in row.values()}
    dictionary = {}
    with args.ecdict.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if row["word"] not in needed:
                continue
            senses = meanings_by_pos(row["translation"].replace("\\n", "\n").splitlines())
            rank = min([int(row[k]) for k in ["bnc", "frq"] if row[k].isdigit() and int(row[k]) > 0] or [999999])
            if rank > 50000 and not row["collins"].strip("0") and row["oxford"] != "1" and row["word"] not in roots:
                continue
            dictionary[row["word"]] = {"senses": senses, "phonetic": row["phonetic"], "rank": rank}

    entries, members = {}, {}
    relations = Counter()
    for root, row in sorted(edges.items()):
        ready = [edge for edge in row.values() if edge["word"] in dictionary and edge["pos"] in dictionary[edge["word"]]["senses"]]
        ready.sort(key=lambda edge: (edge["relation"] != "adverb-adjective", dictionary[edge["word"]]["rank"], edge["word"], edge["rootPos"]))
        if not ready:
            continue
        entries[root] = []
        for edge in ready[:12]:
            member_id = edge["word"] + "#" + edge["pos"]
            source = dictionary[edge["word"]]
            member = members.setdefault(member_id, {"word": edge["word"], "pos": edge["pos"], "meaning": MARK[edge["pos"]] + " " + "；".join(source["senses"][edge["pos"]]), "phonetic": source["phonetic"], "englishDefinitions": []})
            for definition in edge["definitions"]:
                sense = {"pos": edge["pos"], "definition": definition}
                if sense not in member["englishDefinitions"]:
                    member["englishDefinitions"].append(sense)
            entries[root].append({"member": member_id, "rootPos": edge["rootPos"], "relation": edge["relation"], "evidence": edge["evidence"]})
            relations[edge["relation"]] += 1

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

    output = {"schema": 1, "version": "20261029-1", "sources": {"relations": "Princeton WordNet 3.0", "meanings": "ECDICT · MIT"}, "entries": entries, "members": dict(sorted(members.items()))}
    encoded = (json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    (args.out / "families.json").write_bytes(encoded)
    (args.out / "WordNet-LICENSE.txt").write_bytes(archive.read("wordnet/LICENSE"))
    report = {"version": output["version"], "rootCount": len(roots), "coveredRoots": len(entries), "members": len(members), "relations": dict(relations), "relationCount": sum(relations.values()), "adjectiveRootsWithAdverbs": sum(any(edge["rootPos"] == "adjective" and members[edge["member"]]["pos"] == "adverb" for edge in row) for row in entries.values()), "books": {key: {"words": len(words), "coveredRoots": sum(word in entries for word in words)} for key, words in book_keys.items()}, "sources": [{"url": "https://raw.githubusercontent.com/nltk/nltk_data/96f9b3252457a2b97e52aec64c3dfceeb5c312d5/packages/corpora/wordnet.zip", "sha256": hashlib.sha256(args.wordnet.read_bytes()).hexdigest()}, {"url": "https://raw.githubusercontent.com/skywind3000/ECDICT/9c46923fb81a2eb6c264a3a1689562ea7bc56b6a/ecdict.csv", "sha256": hashlib.sha256(args.ecdict.read_bytes()).hexdigest()}], "outputSHA256": hashlib.sha256(encoded).hexdigest(), "filters": ["explicit lexical derivation or adverb/adjective pointer", "current source POS", "matching Chinese target POS", "BNC/FRQ top 50000 or Collins/Oxford/preset member", "at most 12 relations per root", "no guessed suffix forms or synonym edges"]}
    report["ipaFilledFromUS"] = ipa_filled
    report["missingIPA"] = sorted({member["word"] for member in members.values() if not member["phonetic"]})
    if args.ipa_us:
        report["sources"].append({"url": "https://raw.githubusercontent.com/open-dict-data/ipa-dict/44accfb5b0c4c7c146e666c9c7161a5b66e61720/data/en_US.txt", "sha256": hashlib.sha256(args.ipa_us.read_bytes()).hexdigest()})
    (args.out / "families-lock.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["rootCount", "coveredRoots", "members", "relationCount", "adjectiveRootsWithAdverbs", "books"]}, ensure_ascii=False, indent=2))
    for root in ["clear", "happy", "vulnerable", "applicable", "apply", "character", "friendly", "hard", "economic"]:
        print(root, [(edge["rootPos"], edge["member"]) for edge in entries.get(root, [])])


if __name__ == "__main__":
    main()
