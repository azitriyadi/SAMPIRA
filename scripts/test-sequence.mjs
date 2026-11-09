// Browser steps and status transitions share state; preserve their order explicitly.
export function sequential(items, action) {
    return Array.from(items).reduce((chain, item, index) => chain.then(() => action(item, index)), Promise.resolve());
}
