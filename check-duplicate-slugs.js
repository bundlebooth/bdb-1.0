const fs = require('fs');

const data = JSON.parse(fs.readFileSync('packages.json', 'utf8'));

const slugify = (str) =>
  (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const slugMap = {};
for (const pkg of data) {
  const slug = slugify(pkg.name);
  if (slugMap[slug]) {
    slugMap[slug].push(pkg.name);
  } else {
    slugMap[slug] = [pkg.name];
  }
}

for (const [slug, names] of Object.entries(slugMap)) {
  if (names.length > 1) {
    console.warn(`❗ Duplicate slug: "${slug}" from names:`, names);
  }
}
