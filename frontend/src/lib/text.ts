/** "1 invitación" / "3 invitaciones". */
export const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`
