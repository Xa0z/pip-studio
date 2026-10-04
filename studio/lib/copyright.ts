/** Famous characters people can't use. Matching is loose on purpose; Claude also checks. */
const FAMOUS: [string, RegExp][] = [
  ['Mickey Mouse', /\bmickey\b/],
  ['Minnie Mouse', /\bminnie\b/],
  ['Donald Duck', /\bdonald duck\b/],
  ['Pikachu', /\bpikach?u\b/],
  ['Pokémon', /\bpok[eé]mon\b/],
  ['SpongeBob', /\bsponge ?bob\b/],
  ['Patrick Star', /\bpatrick star\b/],
  ['Mario', /\b(super )?mario\b/],
  ['Luigi', /\bluigi\b/],
  ['Sonic', /\bsonic( the hedgehog)?\b/],
  ['Kirby', /\bkirby\b/],
  ['Elsa', /\belsa\b/],
  ['Olaf', /\bolaf\b/],
  ['Shrek', /\bshrek\b/],
  ['Minions', /\bminions?\b/],
  ['Hello Kitty', /\bhello kitty\b/],
  ['Batman', /\bbat ?man\b/],
  ['Spider-Man', /\bspider[- ]?man\b/],
  ['Superman', /\bsuper ?man\b/],
  ['Iron Man', /\biron ?man\b/],
  ['Hulk', /\bhulk\b/],
  ['Groot', /\bgroot\b/],
  ['Goku', /\bgoku\b/],
  ['Naruto', /\bnaruto\b/],
  ['Totoro', /\btotoro\b/],
  ['Stitch', /\blilo|\bstitch\b(?! ?(?:work|ing))/],
  ['Bluey', /\bbluey\b/],
  ['Peppa Pig', /\bpeppa\b/],
  ['Baby Yoda / Grogu', /\b(baby yoda|grogu|yoda)\b/],
  ['Darth Vader', /\bdarth vader\b/],
  ['R2-D2 / C-3PO', /\b(r2[- ]?d2|c[- ]?3po)\b/],
  ['WALL-E', /\bwall[- ]?e\b/],
  ['Buzz Lightyear', /\bbuzz lightyear\b/],
  ['Woody', /\bwoody\b/],
  ['Winnie the Pooh', /\b(winnie|pooh)\b/],
  ['Snoopy', /\bsnoopy\b/],
  ['Garfield', /\bgarfield\b/],
  ['Homer Simpson', /\b(homer|bart|simpsons?)\b/],
  ['Rick and Morty', /\b(rick and morty|morty)\b/],
  ['Optimus Prime', /\boptimus\b/],
  ['Among Us crewmate', /\bamong us\b/],
  ['Minecraft Steve / Creeper', /\b(minecraft|creeper)\b/],
  ['Labubu', /\blabubu\b/],
  ['Duolingo owl', /\bduo(lingo)?\b/],
  ['Kermit', /\bkermit\b/],
  ['Cookie Monster', /\bcookie monster\b/],
];

/** Returns the famous character's name if the description looks like one, else null. */
export function famousCharacter(description: string): string | null {
  const d = description.toLowerCase();
  for (const [name, re] of FAMOUS) if (re.test(d)) return name;
  if (/\b(disney|pixar|marvel|dc comics|nintendo|dreamworks|sanrio|ghibli)\b/.test(d)) return 'a character owned by a big studio';
  return null;
}
