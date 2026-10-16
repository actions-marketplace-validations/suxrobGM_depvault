import "nextra-theme-docs/style.css";
import "./global.css";
import type { PropsWithChildren, ReactElement } from "react";
import Image from "next/image";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";

export const metadata = {
  title: {
    default: "DepVault Documentation",
    template: "%s | DepVault Docs",
  },
  description:
    "Documentation for DepVault — analyze dependencies, encrypt secrets, and ship with confidence.",
  icons: {
    icon: "/depvault-icon.svg",
  },
};

const navbar = (
  <Navbar
    logo={
      <>
        <Image src="/depvault-icon.svg" alt="" width={24} height={24} />
        <b style={{ marginLeft: 8 }}>DepVault</b>
      </>
    }
    projectLink="https://github.com/suxrobGM/depvault"
  />
);

const footer = (
  <Footer>
    <span>MIT {new Date().getFullYear()} © DepVault</span>
  </Footer>
);

export default async function RootLayout(props: PropsWithChildren): Promise<ReactElement> {
  const { children } = props;

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/suxrobGM/depvault/tree/main/apps/docs"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          editLink="Edit this page on GitHub"
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
