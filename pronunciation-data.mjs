const POS = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
  'determiner',
  'numeral',
];
const decode = (s) =>
  String(s || '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, v) =>
      String.fromCodePoint(v[0].toLowerCase() === 'x' ? parseInt(v.slice(1), 16) : Number(v)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, v) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[v],
    );
const text = (s) =>
  decode(String(s || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
const positions = (s) => [
  ...new Set(
    (
      String(s)
        .toLowerCase()
        .match(
          /\b(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|numeral)\b/g,
        ) || []
    ).filter((x) => POS.includes(x)),
  ),
];
function accentOf(s) {
  if (/general american|american|\bus\b|\busa\b|en[-_]us/i.test(s)) return 'us';
  if (/received pronunciation|british|\buk\b|\brp\b|en[-_](uk|gb)/i.test(s)) return 'uk';
  return '';
}
function splitIPA(value) {
  let t = String(value || '').trim();
  if (!t) return [];
  const square = t.startsWith('[') && t.endsWith(']');
  t = t.replace(/^[/\[]|[/\]]$/g, '');
  return t
    .split(/[;；]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (square ? '[' + x + ']' : '/' + x + '/'));
}
function pronunciationData(raw) {
  const readings = [],
    audio = [];
  const add = (r) => {
    if (r.ipa && !readings.some((x) => x.pos === r.pos && x.accent === r.accent && x.ipa === r.ipa))
      readings.push(r);
  };
  const source =
    raw.source || 'https://en.wiktionary.org/wiki/' + encodeURIComponent(raw.word || '');
  let h = String(raw.wiki || '');
  const en = /<h2\b[^>]*\bid=["']English["'][^>]*>/i.exec(h);
  if (en) {
    h = h.slice(en.index + en[0].length);
    const end = /<h2\b/i.exec(h);
    if (end) h = h.slice(0, end.index);
  } else h = '';
  h = h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const events =
    /<(h[2-6])\b[^>]*>([\s\S]*?)<\/\1>|<dt\b[^>]*>([\s\S]*?)<\/dt>|<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let active = false,
    level = 3,
    sectionPOS = [],
    currentPOS = [],
    accentContext = '';
  for (const m of h.matchAll(events)) {
    if (m[1]) {
      const heading = text(m[2]),
        n = Number(m[1].slice(1));
      if (/^Etymology\b/i.test(heading)) {
        sectionPOS = [];
        currentPOS = [];
      }
      if (/^Pronunciation\b/i.test(heading)) {
        active = true;
        level = n;
        currentPOS = sectionPOS;
        accentContext = '';
        continue;
      }
      if (active && n <= level) active = false;
      const p = positions(heading);
      if (p.length) {
        sectionPOS = p;
        currentPOS = p;
      }
      continue;
    }
    if (!active) continue;
    if (m[3]) {
      const label = text(m[3]),
        p = positions(label);
      if (p.length) currentPOS = p;
      const a = accentOf(label);
      if (a) accentContext = a;
      continue;
    }
    const li = m[4],
      plain = text(li),
      prefix = plain.split(/\bIPA\b/)[0],
      p = positions(prefix),
      part = p.length ? p : currentPOS,
      a = accentOf(prefix) || accentContext;
    if (/\bIPA\b/.test(plain) && !/^(?:Rhymes|Hyphenation|Homophones)/i.test(plain)) {
      for (const ip of li.matchAll(
        /<span\b[^>]*class=["'][^"']*\bIPA\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
      ))
        for (const ipa of splitIPA(text(ip[1])))
          for (const pos of part.length ? part : [''])
            add({ pos, accent: a, ipa, verified: !!pos, source });
    }
    for (const media of li.matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      let url = decode(media[1]);
      if (url.startsWith('//')) url = 'https:' + url;
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || u.hostname !== 'upload.wikimedia.org') continue;
        const explicitPOS = positions(decodeURIComponent(u.pathname).replace(/[-_]/g, ' ')),
          parts = part.length ? part : explicitPOS;
        const ac = accentOf(plain) || accentOf(u.pathname) || accentContext;
        if (!parts.length) continue;
        for (const pos of parts)
          if (!audio.some((x) => x.pos === pos && x.accent === ac))
            audio.push({ pos, accent: ac, url, source });
      } catch {}
    }
  }
  for (const d of raw.dictionary || []) {
    const parts = [...new Set((d.meanings || []).map((m) => m.partOfSpeech))];
    if (parts.length !== 1) continue;
    for (const ph of d.phonetics || [])
      for (const ipa of splitIPA(ph.text))
        add({
          pos: parts[0],
          accent: accentOf(ph.audio || ''),
          ipa,
          audio: ph.audio || '',
          verified: true,
          source: d.sourceUrls?.[0] || source,
        });
  }
  const onlyPOS = [
    ...new Set(
      (raw.dictionary || []).flatMap((d) => (d.meanings || []).map((m) => m.partOfSpeech)),
    ),
  ];
  for (const r of readings) {
    if (!r.pos && onlyPOS.length === 1) {
      r.pos = onlyPOS[0];
      r.verified = true;
    }
    const matched = audio.find((a) => a.pos === r.pos && a.accent === r.accent);
    if (matched && !r.audio) r.audio = matched.url;
  }
  return {
    pronunciationVersion: 1,
    pronunciationGroups: readings.filter((r) => r.pos && r.verified),
    unmappedPronunciations: readings.filter((r) => !r.pos),
  };
}
function withPronunciations(raw) {
  return { ...raw, ...pronunciationData(raw) };
}
export { pronunciationData, withPronunciations, splitIPA };
