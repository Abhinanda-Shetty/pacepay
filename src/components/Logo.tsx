import { Link } from "@tanstack/react-router";
import logoMark from "@/assets/pacepay-logo-mark.png.asset.json";

export function Logo() {
  return (
    <Link to="/" aria-label="PacePay home" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <img src={logoMark.url} alt="" className="h-8 w-8 rounded-lg" />
      <span>Pace<span className="text-primary">Pay</span></span>
    </Link>
  );
}
