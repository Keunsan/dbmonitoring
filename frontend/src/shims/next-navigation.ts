/** Next.js navigation → react-router-dom 호환 shim입니다. */
import { useLocation, useNavigate, useParams } from "react-router-dom";

export const usePathname = () => useLocation().pathname;

export const useRouter = () => {
  const navigate = useNavigate();
  return {
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path, { replace: true }),
    back: () => navigate(-1),
  };
};

export { useParams };