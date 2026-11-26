/** Next.js Link → react-router-dom 호환 shim입니다. */
import { Link as RouterLink, type LinkProps } from "react-router-dom";
import type { ReactNode } from "react";

type NextLinkProps = Omit<LinkProps, "to"> & {
  href: string;
  children?: ReactNode;
};

export default function Link({ href, children, ...props }: NextLinkProps) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}