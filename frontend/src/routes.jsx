import React from "react";

// Admin Imports
import MainDashboard from "views/admin/default";
import NFTMarketplace from "views/admin/marketplace";
import Profile from "views/admin/profile";
import DataTables from "views/admin/tables";
import RTLDefault from "views/rtl/default";
import GapGenerator from "views/admin/GapsGenerator";
import SoAGenerator from "views/admin/SoAGenerator";
import Documents from "views/admin/Documents";
import InternalAuditGapAssessment from "views/admin/InternalAuditGapAssessment";
import SoALiteGenerator from "views/admin/SoALiteGenerator";
import SavedSoAs from "views/admin/SavedSoAs";
import SavedSoADetail from "views/admin/SavedSoADetail";

// Auth Imports
import SignIn from "views/auth/SignIn";

// Icon Imports
import {
  MdHome,
  MdOutlineShoppingCart,
  MdBarChart,
  MdPerson,
  MdLock,
  MdAutoAwesome,
  MdDescription,
  MdAssignment
} from "react-icons/md";

const routes = [
  {
    name: "Main Dashboard",
    layout: "/admin",
    path: "default",
    icon: <MdHome className="h-6 w-6" />,
    component: <MainDashboard />,
  },
  /* {
    name: "NFT Marketplace",
    layout: "/admin",
    path: "nft-marketplace",
    icon: <MdOutlineShoppingCart className="h-6 w-6" />,
    component: <NFTMarketplace />,
    secondary: true,
  },
  {
    name: "Data Tables",
    layout: "/admin",
    icon: <MdBarChart className="h-6 w-6" />,
    path: "data-tables",
    component: <DataTables />,
  }, */
  /* {
    name: "Profile",
    layout: "/admin",
    path: "profile",
    icon: <MdPerson className="h-6 w-6" />,
    component: <Profile />,
  },
  {
    name: "Sign In",
    layout: "/auth",
    path: "sign-in",
    icon: <MdLock className="h-6 w-6" />,
    component: <SignIn />,
  },
  {
    name: "SoA Generator",
    layout: "/admin",
    path: "soa-generator",
    icon: <MdBarChart className="h-6 w-6" />,
    component: <SoAGenerator />,
  },  
  {
    name: "Gap Generator",
    layout: "/admin",
    path: "gap-generator",
    icon: <MdAutoAwesome className="h-6 w-6" />,
    component: <GapGenerator />,
  },  
  {
    name: "Documents",
    layout: "/admin",
    path: "documents",
    icon: <MdDescription className="h-6 w-6" />,
    component: <Documents />,
  }, */
  {
    name: "IA Gap Assessment",
    layout: "/admin",
    path: "internal-audit-gaps",
    icon: <MdBarChart className="h-6 w-6" />,
    component: <InternalAuditGapAssessment />,
  },
  {
    name: "SoA Lite",
    layout: "/admin",
    path: "soa-lite",
    icon: <MdAssignment className="h-6 w-6" />,
    component: <SoALiteGenerator />,
  },
  {
    name: "Saved SoAs",
    layout: "/admin",
    path: "saved-soas",
    icon: <MdDescription className="h-6 w-6" />,
    component: <SavedSoAs />,
  },
  {
    name: "Saved SoA Detail",
    layout: "/admin",
    path: "saved-soas/:id",
    component: <SavedSoADetail />,
    invisible: true,
  },
];
export default routes;
