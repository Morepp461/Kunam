export type CaleOutfit = "formal" | "fia" | "racing";
export type CaleContext = "onboarding" | "warning" | "race" | "general";
export type CaleCategory =
  | "idle"
  | "welcome"
  | "tutorial"
  | "reactions"
  | "interactions"
  | "motorsport"
  | "navigation";

export type CaleDesign = {
  id: string;
  category: CaleCategory;
  outfit: CaleOutfit;
  description: string;
  marker?: string;
  /** The 57 IDs are the stable visual-state contract. Dedicated pose artwork is still a separate asset-delivery gate. */
  artworkStatus: "wardrobe-master";
};

const define = (
  category: CaleCategory,
  outfit: CaleOutfit,
  entries: Array<[string, string, string?]>,
): CaleDesign[] =>
  entries.map(([id, description, marker]) => ({
    id,
    category,
    outfit,
    description,
    marker,
    artworkStatus: "wardrobe-master",
  }));

export const CALE_DESIGNS: CaleDesign[] = [
  ...define("idle", "formal", [
    ["idle_default", "Cale berdiri santai dalam posisi netral"],
    ["idle_look_around", "Cale mengamati area sekitar", "⌕"],
    ["idle_blink", "Ekspresi netral dengan kedipan mata", "◉"],
    ["idle_tail_swing", "Cale dengan gestur ekor santai"],
    ["idle_arms_crossed", "Cale berdiri dengan tangan terlipat"],
    ["idle_shift_weight", "Cale dengan postur santai bertumpu pada satu kaki"],
    ["idle_look_at_user", "Cale menghadap langsung kepada pengguna"],
  ]),
  ...define("welcome", "formal", [
    ["welcome_wave", "Cale menyambut pengguna dengan lambaian tangan", "✦"],
    ["welcome_nod", "Cale memberi anggukan ramah", "✓"],
    ["welcome_salute", "Cale memberi salam formal", "✧"],
    ["welcome_appear", "Cale tampil sebagai pengantar halaman", "✦"],
    ["welcome_excited", "Cale menunjukkan ekspresi antusias", "★"],
  ]),
  ...define("tutorial", "formal", [
    ["tutorial_point_left", "Cale menunjuk area di sebelah kiri", "←"],
    ["tutorial_point_right", "Cale menunjuk area di sebelah kanan", "→"],
    ["tutorial_point_up", "Cale menunjuk area di bagian atas", "↑"],
    ["tutorial_point_down", "Cale menunjuk area di bagian bawah", "↓"],
    ["tutorial_point_screen", "Cale menunjuk area antarmuka", "⌖"],
    ["tutorial_explain", "Cale menjelaskan langkah yang sedang dibuka", "i"],
    ["tutorial_present", "Cale memperkenalkan sebuah fitur", "✧"],
    ["tutorial_attention", "Cale mengarahkan perhatian pengguna", "!"],
    ["tutorial_look_target", "Cale mengarahkan pandangan ke target UI", "⌖"],
    ["tutorial_think", "Cale menunjukkan ekspresi berpikir", "?"],
    ["tutorial_wait", "Cale menunggu tindakan pengguna", "…"],
    ["tutorial_encourage", "Cale memberi dorongan untuk melanjutkan", "✓"],
  ]),
  ...define("reactions", "formal", [
    ["reaction_success", "Cale merespons keberhasilan", "✓"],
    ["reaction_perfect", "Cale merayakan hasil sempurna", "★"],
    ["reaction_approved", "Cale menyetujui tindakan", "✓"],
    ["reaction_confused", "Cale tampak bingung", "?"],
    ["reaction_surprised", "Cale menunjukkan ekspresi terkejut", "!"],
    ["reaction_thinking", "Cale sedang mempertimbangkan sesuatu", "…"],
    ["reaction_disappointed", "Cale menunjukkan ekspresi kecewa", "−"],
    ["reaction_warning", "Cale menyampaikan peringatan resmi", "!"],
    ["reaction_error", "Cale menunjukkan bahwa tindakan perlu diperiksa", "×"],
    ["reaction_question", "Cale meminta pengguna memeriksa informasi", "?"],
  ]).map((item) =>
    item.id === "reaction_warning" || item.id === "reaction_error"
      ? { ...item, outfit: "fia" as const }
      : item,
  ),
  ...define("interactions", "formal", [
    ["interaction_thumbsup", "Cale memberi gestur jempol", "✓"],
    ["interaction_ok", "Cale memberi tanda OK", "✓"],
    ["interaction_clap", "Cale bertepuk tangan", "✦"],
    ["interaction_point", "Cale menunjuk sebuah elemen", "⌖"],
    ["interaction_shrug", "Cale mengangkat bahu", "—"],
    ["interaction_arms_crossed", "Cale berdiri dengan tangan terlipat"],
    ["interaction_celebrate", "Cale merayakan pencapaian", "★"],
    ["interaction_facepalm", "Cale bereaksi terhadap kesalahan ringan", "·"],
  ]),
  ...define("motorsport", "racing", [
    ["motorsport_helmet_check", "Cale memeriksa helm balap", "◉"],
    ["motorsport_gloves_adjust", "Cale merapikan sarung tangan balap"],
    ["motorsport_ready", "Cale bersiap menghadapi sesi balap", "旗"],
    ["motorsport_focus", "Cale menunjukkan fokus sebelum balapan"],
    ["motorsport_race_start", "Cale memberi aba-aba awal balapan", "▶"],
    ["motorsport_podium", "Cale merayakan hasil podium", "★"],
    ["motorsport_trophy", "Cale menampilkan trofi kemenangan", "🏆"],
    ["motorsport_strategy", "Cale membahas strategi balap", "▤"],
  ]),
  ...define("navigation", "formal", [
    ["navigation_guide", "Cale membantu navigasi antarmuka", "⌖"],
    ["loading_wait", "Cale menemani proses pemuatan", "…"],
    ["loading_thinking", "Cale sedang memproses informasi", "…"],
    ["loading_impatient", "Cale menunggu proses selesai", "·"],
    ["transition_enter", "Cale menjadi penanda masuk ke halaman"],
    ["transition_exit", "Cale menjadi penanda keluar dari halaman"],
    ["transition_idle", "Cale kembali ke tampilan netral"],
  ]),
];

export const CALE_DESIGN_MAP = Object.fromEntries(
  CALE_DESIGNS.map((design) => [design.id, design]),
) as Record<string, CaleDesign>;

export function getCaleDesign(id: string): CaleDesign | undefined {
  return CALE_DESIGN_MAP[id];
}

export function resolveCaleOutfit(context: CaleContext): CaleOutfit {
  switch (context) {
    case "onboarding":
      return "formal";
    case "warning":
      return "fia";
    case "race":
      return "racing";
    default:
      return "formal";
  }
}

export function resolveCaleContext(pathname: string): CaleContext {
  const path = pathname.toLowerCase();
  if (path.includes("paddock-access") || path.includes("onboarding")) return "onboarding";
  if (path.includes("warning") || path.includes("punishment") || path.includes("appeal-room")) return "warning";
  if (
    path.includes("race") ||
    path.includes("premio") ||
    path.includes("zwei") ||
    path.includes("motorsport") ||
    path.includes("circuit")
  ) return "race";
  return "general";
}

export function getCaleDesignCount(): number {
  return CALE_DESIGNS.length;
}
