/** Use the publisher's headline to identify a rant; ordinary losses are not automatically rants. */
export function isJetsRant(title) {
  return typeof title === 'string' && /\b(?:Jets|NYJ)\b/i.test(title) && (/\brants?\b|\bmeltdown\b|\b(?:rips?|torches?|unloads?|erupts?|furious|livid|apoplectic)\b|\bfed up\b|\bgoes (?:off|ballistic|nuclear|berserk)\b|\b(?:are|is) (?:a )?joke\b/i.test(title)
    || /\b(?:benigno|francesa|tierney|licata|la greca|BT|Sal)\b.*\bdestroys\b/i.test(title));
}
