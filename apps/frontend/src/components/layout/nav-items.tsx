import {
  CreditCard as CreditCardIcon,
  Dashboard as DashboardIcon,
  Folder as FolderIcon,
  History as HistoryIcon,
  Security as SecurityNavIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { ROUTES } from "@/lib/constants";

/** Primary dashboard navigation, shared by `Sidebar` and its loading skeleton. */
export const NAV_ITEMS = [
  { label: "Overview", icon: <DashboardIcon />, href: ROUTES.overview },
  { label: "Projects", icon: <FolderIcon />, href: ROUTES.projects },
  { label: "Activity", icon: <HistoryIcon />, href: ROUTES.activity },
  { label: "Security", icon: <SecurityNavIcon />, href: ROUTES.security },
  { label: "Billing", icon: <CreditCardIcon />, href: ROUTES.billing },
  { label: "Settings", icon: <SettingsIcon />, href: ROUTES.settings },
];
