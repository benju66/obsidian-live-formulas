/** Masks single- and double-quoted string literals so regex passes do not treat cell-like text inside quotes as refs. */
export function maskFormulaStrings(input: string): { text: string; tokens: string[] } {
    const tokens: string[] = [];
    const text = input.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        tokens.push(match);
        return `"__STR${tokens.length - 1}__"`;
    });
    return { text, tokens };
}

export function unmaskFormulaStrings(text: string, tokens: string[]): string {
    if (!tokens.length) return text;
    return text.replace(/"__STR(\d+)__"/g, (_, i) => tokens[parseInt(i, 10)]);
}

/** Masks scientific notation so `1e-3` is not mistaken for cell E3. */
export function maskScientificNotation(input: string): { text: string; tokens: string[] } {
    const tokens: string[] = [];
    const text = input.replace(/\d+(\.\d+)?[Ee][+-]?\d+/g, (match) => {
        tokens.push(match);
        return `__SCI_${tokens.length}__`;
    });
    return { text, tokens };
}

export function unmaskScientificNotation(text: string, tokens: string[]): string {
    let out = text;
    for (let i = 0; i < tokens.length; i++) {
        out = out.split(`__SCI_${i + 1}__`).join(tokens[i]);
    }
    return out;
}

/**
 * Mask string literals and scientific notation, run `transform` on the masked text, then unmask in reverse order.
 */
export function transformFormulaPreservingLiterals(formula: string, transform: (masked: string) => string): string {
    const { text: afterStrings, tokens: stringTokens } = maskFormulaStrings(formula);
    const { text: masked, tokens: sciTokens } = maskScientificNotation(afterStrings);
    let out = transform(masked);
    out = unmaskScientificNotation(out, sciTokens);
    out = unmaskFormulaStrings(out, stringTokens);
    return out;
}
