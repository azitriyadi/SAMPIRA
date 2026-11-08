// Explicit, opt-in CMS import. Never runs at application startup or writes SQL.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const contentFile = new URL('../docs/content/SAMPIRA_KONTEN_EDUKASI_TERVERIFIKASI.md', import.meta.url);
const manage = '/api/ecorecycle/education/manage/articles';
const fields = ['slug', 'title', 'summary', 'body', 'category', 'sources'];
// Retain the original editorial category in the body; use existing CMS taxonomy.
const categories = [
    'pemilahan-sampah', 'pengurangan-sampah', 'pengomposan', 'bank-sampah',
    'pengurangan-sampah', 'sampah-elektronik', 'pengurangan-sampah',
    'pemilahan-sampah', 'pemilahan-sampah', 'panduan-sampira'
];

export async function loadEducationContent(file = contentFile) {
    const markdown = await readFile(file, 'utf8');
    const sections = [...markdown.matchAll(/^## (\d{2}) — (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
    assert.equal(sections.length, 10, 'Expected exactly ten curated articles.');
    const articles = sections.map(([, number, title, section], index) => {
        assert.equal(Number(number), index + 1, 'Article order changed.');
        const meta = key => {
            const match = section.match(new RegExp('^- ' + key + ': (.+)$', 'm'));
            assert(match, 'Missing ' + key + ' in ' + number);
            return match[1].trim();
        };
        const slug = meta('Slug').replace(/^`|`$/g, '');
        const parts = section.match(/\*\*Isi artikel\*\*\s+([\s\S]+?)\s+\*\*Aksi untuk pembaca:\*\* ([\s\S]+?)\s+\*\*Sumber:\*\*\s+([\s\S]+)/);
        assert(parts, 'Missing body, action or sources in ' + slug);
        // Only remove the package separator, never source text or attributions.
        const sourceText = parts[3].replace(/\n---\s*$/, '').trim();
        const sources = [...new Set(sourceText.match(/https:\/\/[^\s)]+/g) || [])];
        const body = `Kategori editorial: ${meta('Kategori')}\nLabel editorial: ${meta('Label editorial')}\n\n` +
            parts[1].trim() + '\n\nAksi untuk pembaca: ' + parts[2].trim() + '\n\nSumber dan atribusi:\n' + sourceText;
        const article = {slug, title: title.trim(), summary: meta('Ringkasan'), body, category: categories[index], sources};
        assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 120);
        for (const [key, min, max] of [['title', 3, 120], ['summary', 10, 320], ['body', 20, 12000]]) {
            assert([...article[key]].length >= min && [...article[key]].length <= max, 'CMS length: ' + slug + '/' + key);
            assert(!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(article[key]), 'CMS plain text: ' + slug);
        }
        assert(sources.length > 0 && sources.length <= 8);
        for (const source of sources) {
            const url = new URL(source);
            assert(url.protocol === 'https:' && !url.username && !url.password);
        }
        return article;
    });
    assert.equal(new Set(articles.map(item => item.slug)).size, 10);
    return articles;
}

export async function educationAPI(origin, token, path, method = 'GET', body) {
    const response = await fetch(origin + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {Authorization: 'Bearer ' + token, ...(body && {'Content-Type': 'application/json'})},
        ...(body && {body: JSON.stringify(body)})
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(`${method} ${path}: HTTP ${response.status} ${result.message || 'CMS request failed'}`), {status: response.status});
    return result.data;
}

export async function importEducation({origin, token, articles, apply = false, publish = false}) {
    const url = new URL(origin);
    assert(['http:', 'https:'].includes(url.protocol) && url.origin === origin && !url.username && !url.password, 'Use an exact HTTP(S) origin.');
    assert(token, 'Set SAMPIRA_CONTENT_TOKEN to an authenticated Admin token.');
    const api = (path, method, body) => educationAPI(origin, token, path, method, body);
    const existing = new Map();
    let page = 1;
    do {
        const data = await api(manage + '?limit=50&page=' + page);
        for (const item of data.items) existing.set(item.slug, item);
        page = data.next_page;
    } while (page);
    const results = [];
    for (const article of articles) {
        const found = existing.get(article.slug);
        if (found) {
            const current = await api(manage + '/' + found.id);
            const identical = fields.every(key => JSON.stringify(current[key]) === JSON.stringify(article[key]));
            results.push({slug: article.slug, action: identical ? 'skipped-identical' : 'skipped-editorial-conflict', id: current.id, status: current.status});
            continue; // Never edit, publish, archive or delete a pre-existing article.
        }
        if (!apply) { results.push({slug: article.slug, action: 'would-create', status: publish ? 'published' : 'draft'}); continue; }
        let item;
        try { item = await api(manage, 'POST', article); }
        catch (error) {
            // The unique slug constraint also protects concurrent imports.
            if (error.status !== 409) throw error;
            results.push({slug: article.slug, action: 'skipped-concurrent'});
            continue;
        }
        if (publish) {
            item = await api(manage + '/' + item.id + '/publication', 'POST', {version: item.version, status: 'published'});
        }
        results.push({slug: article.slug, action: 'created', id: item.id, status: item.status});
    }
    return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const args = process.argv.slice(2);
        assert(args.every((arg, i) => ['--origin', '--apply', '--publish', '--allow-main'].includes(arg) || args[i - 1] === '--origin'), 'Unknown argument.');
        const originIndex = args.indexOf('--origin');
        const articles = await loadEducationContent();
        if (originIndex < 0) {
            assert(!args.length, 'Provide --origin for API import.');
            console.log(JSON.stringify(articles.map(({slug, title, category, sources}) => ({slug, title, category, source_count: sources.length})), null, 2));
        } else {
            const origin = args[originIndex + 1];
            // Port 8080 is the known primary runtime. A separate explicit opt-in is mandatory.
            if (args.includes('--apply') && new URL(origin).port === '8080') assert(args.includes('--allow-main'), 'Primary import requires explicit user approval and --allow-main.');
            console.log(JSON.stringify(await importEducation({origin, token: process.env.SAMPIRA_CONTENT_TOKEN, articles,
                apply: args.includes('--apply'), publish: args.includes('--publish')}), null, 2));
        }
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
