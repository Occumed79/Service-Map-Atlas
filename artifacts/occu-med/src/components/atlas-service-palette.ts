export const SERVICE_ORDER = [
  "Dental",
  "Chest X-Ray",
  "B-Reader",
  "Spirometry",
  "Pulmonary Function Testing",
  "Drug Screen",
  "DOT Physical",
  "Audiogram",
  "EKG",
  "Treadmill Stress Test",
  "Laboratory Services",
  "Titers",
  "Vaccinations",
  "Physical Examination",
  "Vision Testing",
  "Occupational Medicine",
  "Specialty Services",
] as const;

/**
 * Atlas spectrum sampled from Alex's yellow / lime / cyan / blue / violet
 * reference art. Every category owns one unique, high-chroma color.
 */
export const SERVICE_COLORS: Record<string, string> = {
  Dental: "#FFFF00",
  "Chest X-Ray": "#DFFF00",
  "B-Reader": "#BDE902",
  Spirometry: "#70D603",
  "Pulmonary Function Testing": "#31C501",
  "Drug Screen": "#00E7A8",
  "DOT Physical": "#00D9D4",
  Audiogram: "#00C7FF",
  EKG: "#258CFF",
  "Treadmill Stress Test": "#4360CF",
  "Laboratory Services": "#5021E4",
  Titers: "#5E00BE",
  Vaccinations: "#6B1AB9",
  "Physical Examination": "#851BD4",
  "Vision Testing": "#A022E5",
  "Occupational Medicine": "#C61BE8",
  "Specialty Services": "#E100FF",
};
