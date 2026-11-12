import { Link } from "@tanstack/react-router";
import logoFull from "@/assets/pacepay-logo-full-cropped.jpg.asset.json";

export function Logo() {
  return (
    <Link to="/" aria-label="PacePay home" className="inline-flex shrink-0 items-center">
      <img src={logoFull.url} alt="PacePay" className="h-16 w-24 rounded-lg object-contain" />
    </Link>
  );
}
