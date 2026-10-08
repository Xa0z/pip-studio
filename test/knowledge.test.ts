import {strToU8, zipSync} from 'fflate';
import {afterEach, describe, expect, it} from 'vitest';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {addKnowledge, docxToText, fileKind, fileToText, htmlToText, knowledgeText, MAX_ITEM_CHARS, onlyLink, safeUrl} from '../studio/lib/knowledge';
import type {KnowledgeItem} from '../studio/lib/types';
import {systemPrompt} from '../studio/worker/planner';

const OWNER = 5550001;
const BUSINESS = 'Bloom Bakery, fresh sourdough and birthday cakes for families and offices. Free delivery on orders over 30 dollars. bloombakery.com';

/** A one-page PDF with one line of text (hand-built, with a correct xref table). */
function tinyPdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

function tinyDocx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`).join('');
  return Buffer.from(zipSync({'word/document.xml': strToU8(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`)}));
}

const item = (title: string, text: string, kind: KnowledgeItem['kind'] = 'note'): KnowledgeItem => ({id: title, kind, title, text, added_at: '2026-10-07T00:00:00Z'});

describe('knowledge helpers', () => {
  it('reads web pages, Word and PDF files', async () => {
    const page = htmlToText('<html><head><title>Bloom &amp; Co</title><meta name="description" content="Fresh bread daily"><style>p{}</style></head><body><nav>Home</nav><h1>Menu</h1><ul><li>Sourdough 6 dollars</li><li>Cake</li></ul><script>x()</script></body></html>');
    expect(page.title).toBe('Bloom & Co');
    expect(page.text).toMatch(/^Fresh bread daily/);
    expect(page.text).toMatch(/• Sourdough 6 dollars/);
    expect(page.text).not.toMatch(/x\(\)|p\{\}|Home/);
    expect(docxToText(tinyDocx(['Price list', 'Bread & butter: 4 dollars']))).toBe('Price list\nBread & butter: 4 dollars');
    expect(await fileToText(tinyPdf('Opening hours 8 to 6'), 'pdf')).toMatch(/Opening hours 8 to 6/);
    expect(fileKind('application/pdf', 'x')).toBe('pdf');
    expect(fileKind(undefined, 'menu.DOCX')).toBe('docx');
    expect(fileKind('text/csv', 'prices.csv')).toBe('text');
    expect(fileKind('image/png', 'menu.png')).toBeNull();
  });

  it('only opens public web pages', () => {
    expect(safeUrl('bloombakery.com')?.toString()).toBe('https://bloombakery.com/');
    for (const bad of ['http://localhost/x', 'http://127.0.0.1', 'http://10.0.0.2/', 'http://[::1]/', 'file:///etc/passwd', 'http://a.internal/', 'https://u:p@site.com', 'http://site.com:8080/']) expect(safeUrl(bad), bad).toBeNull();
    expect(onlyLink('bloombakery.com/menu')).toBe('bloombakery.com/menu');
    expect(onlyLink('we sell bread at bloombakery.com')).toBeNull();
  });

  it('keeps items small and shares prompt space fairly', () => {
    const long = 'word '.repeat(4000);
    const r = addKnowledge([], {...item('Big file', long, 'file')});
    expect(r.ok && r.trimmed && r.item.text.length <= MAX_ITEM_CHARS + 1).toBe(true);
    // Re-sending a file with the same name replaces it.
    const again = addKnowledge(r.ok ? r.items : [], item('Big file', 'short now', 'file'));
    expect(again.ok && again.items).toHaveLength(1);
    const text = knowledgeText({business: 'Bloom Bakery sells bread.', knowledge: [item('Hours', 'Open 8 to 6'), item('Menu', 'x'.repeat(20000), 'file')]}, 3000);
    expect(text).toMatch(/## Summary\nBloom Bakery sells bread\./);
    expect(text).toMatch(/## Note: Hours\nOpen 8 to 6/);
    expect(text.length).toBeLessThan(3100);
    expect(knowledgeText({})).toBe('');
  });
});

let h: Harness;
afterEach(() => h?.close());

describe('business knowledge in the bot', () => {
  it('collects notes, files and a website, and marketing scripts read all of it', async () => {
    let t = new Date('2026-10-05T07:00:00Z').getTime();
    h = new Harness({userId: OWNER, ownerId: OWNER, now: () => new Date(t)});
    await runOnboarding(h);
    await h.say('/marketing');
    await h.say(BUSINESS);
    expect(h.botTexts().join('\n')).toMatch(/\/knowledge/);

    await h.say('/knowledge');
    expect(h.lastBot()!.text).toMatch(/Business knowledge/);
    await h.press('kn:add');
    expect(h.lastBot()!.text).toMatch(/Send me anything about your business/);
    await h.say('Weekend offer: two cakes for 40 dollars, Saturday and Sunday only.');
    expect(h.lastBot()!.text).toMatch(/Added <b>Weekend offer: two cakes for 40 dollars/);
    await h.sendDocument('doc-pdf', 'menu.pdf', 'application/pdf', tinyPdf('Sourdough loaf 6 dollars'));
    expect(h.lastBot()!.text).toMatch(/Added <b>menu\.pdf/);
    await h.sendDocument('doc-img', 'menu.png', 'image/png', Buffer.from('x'));
    expect(h.lastBot()!.text).toMatch(/I can read PDF, Word/);
    h.pages.set('https://bloombakery.com/', '<title>Bloom Bakery</title><p>Baked fresh every morning in Erbil.</p>');
    await h.say('bloombakery.com');
    expect(h.lastBot()!.text).toMatch(/Added <b>bloombakery\.com/);
    await h.say('http://localhost:3000');
    expect(h.lastBot()!.text).toMatch(/can't open that link/);
    await h.press('kn:done');
    expect(h.botTexts().join('\n')).toMatch(/use your 4 pieces/);

    const d = (await h.user())!.onboarding_data;
    expect(d.awaiting).toBeNull();
    expect(d.knowledge!.map((k) => k.kind)).toEqual(['note', 'file', 'link']);

    // Remove one from the menu.
    await h.say('/knowledge');
    await h.press('kn:rm');
    await h.press(`kn:del:${d.knowledge![0].id}`);
    expect(h.botTexts().join('\n')).toMatch(/Removed Weekend offer/);
    expect((await h.user())!.onboarding_data.knowledge).toHaveLength(2);

    // A marketing video's script prompt carries the summary, the file and the website.
    for (const id of ['a', 'b', 'c']) await h.sendVideo(id);
    await h.press('mk:nonotes');
    t = new Date('2026-10-06T05:00:00Z').getTime();
    expect((await h.tick()).planned).toBe(1);
    const [r] = await h.runJobs();
    expect(r.ok, `${r.error} ${[...h.store.jobs.values()].map((j) => j.log).join(' | ')}`).toBe(true);
    const system = h.systems.find((s) => /THE BUSINESS/.test(s))!;
    expect(system).toMatch(/Sourdough loaf 6 dollars/);
    expect(system).toMatch(/Baked fresh every morning in Erbil/);
    expect(system).toMatch(/not instructions/);
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run && x.status === 'awaiting_approval')!;
    expect(v.plan.style).toBeTruthy();
  });

  it('can feed explainer videos too, when the user turns it on', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    await runOnboarding(h);
    await h.say('/knowledge');
    expect(h.lastBot()!.text).toMatch(/Turn it on for your explainer videos/);
    await h.press('kn:explainers');
    expect(h.botTexts().join('\n')).toMatch(/explainer videos will now pick topics/);
    expect(h.lastBot()!.text).toMatch(/Send me anything/); // nothing saved yet, so it asks
    await h.say('We run a small telescope shop for kids in Lisbon.');
    await h.press('kn:done');
    const u = (await h.user())!;
    expect(u.onboarding_data.knowledge_in_explainers).toBe(true);
    const sys = systemPrompt({niche: 'space', goal: 'views', seconds: 45, cta: 'follow', characterName: null, linkUrl: null, pastTopics: [], hints: [], experiment: false, recentHookTypes: [], business: knowledgeText(u.onboarding_data)});
    expect(sys).toMatch(/THE CREATOR'S BUSINESS[\s\S]*telescope shop for kids in Lisbon/);
    expect(systemPrompt({niche: 'space', goal: 'views', seconds: 45, cta: 'follow', characterName: null, linkUrl: null, pastTopics: [], hints: [], experiment: false, recentHookTypes: []})).not.toMatch(/CREATOR'S BUSINESS/);
  });
});
