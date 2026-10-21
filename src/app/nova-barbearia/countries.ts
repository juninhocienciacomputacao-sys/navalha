// Países para cadastrar a barbearia: o país define moeda, idioma e fuso (o dono só escolhe).
export const COUNTRIES = [
  { code: "BR", flag: "🇧🇷", name: "Brasil", currency: "BRL", lang: "pt", zones: [
    { tz: "America/Sao_Paulo", label: "Brasília" }, { tz: "America/Manaus", label: "Manaus (−1h)" },
    { tz: "America/Cuiaba", label: "Cuiabá (−1h)" }, { tz: "America/Rio_Branco", label: "Acre (−2h)" },
    { tz: "America/Noronha", label: "Noronha (+1h)" },
  ] },
  { code: "PT", flag: "🇵🇹", name: "Portugal", currency: "EUR", lang: "pt", zones: [{ tz: "Europe/Lisbon", label: "Lisboa" }, { tz: "Atlantic/Azores", label: "Açores" }] },
  { code: "AR", flag: "🇦🇷", name: "Argentina", currency: "ARS", lang: "es", zones: [{ tz: "America/Argentina/Buenos_Aires", label: "Buenos Aires" }] },
  { code: "UY", flag: "🇺🇾", name: "Uruguai", currency: "UYU", lang: "es", zones: [{ tz: "America/Montevideo", label: "Montevidéu" }] },
  { code: "PY", flag: "🇵🇾", name: "Paraguai", currency: "PYG", lang: "es", zones: [{ tz: "America/Asuncion", label: "Assunção" }] },
  { code: "CL", flag: "🇨🇱", name: "Chile", currency: "CLP", lang: "es", zones: [{ tz: "America/Santiago", label: "Santiago" }] },
  { code: "MX", flag: "🇲🇽", name: "México", currency: "MXN", lang: "es", zones: [{ tz: "America/Mexico_City", label: "Cidade do México" }] },
  { code: "US", flag: "🇺🇸", name: "Estados Unidos", currency: "USD", lang: "en", zones: [
    { tz: "America/New_York", label: "Leste" }, { tz: "America/Chicago", label: "Centro" }, { tz: "America/Denver", label: "Montanha" }, { tz: "America/Los_Angeles", label: "Pacífico" },
  ] },
] as const;

export const ALLOWED_TZ = new Set<string>(COUNTRIES.flatMap((c) => c.zones.map((z) => z.tz)));
export const ALLOWED_CURRENCY = new Set<string>(COUNTRIES.map((c) => c.currency));
