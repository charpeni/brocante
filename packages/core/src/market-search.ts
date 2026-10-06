export const MAX_SEARCH_LENGTH = 256;

// Group user terms so OR cannot escape the repository and open-PR scope.
export function githubSearchQuery(repository: string, input: string) {
  const search = input.trim();
  if (search.length > MAX_SEARCH_LENGTH)
    throw new Error(`Keep your search under ${MAX_SEARCH_LENGTH + 1} characters.`);
  if (search.includes('\\'))
    throw new Error('Use plain quotation marks without backslashes in your search.');
  let quoted = false;
  let depth = 0;
  for (const character of search) {
    if (character === '"') quoted = !quoted;
    if (quoted) continue;
    if (character === '(' && ++depth > 4)
      throw new Error('Use at most four levels of parentheses in your search.');
    if (character === ')' && --depth < 0)
      throw new Error('Close each opening parenthesis and quotation mark in your search.');
  }
  if (quoted || depth)
    throw new Error('Close each opening parenthesis and quotation mark in your search.');
  const scope = `repo:${repository} is:pr is:open`;
  return search ? `(${scope}) AND (${search})` : scope;
}
