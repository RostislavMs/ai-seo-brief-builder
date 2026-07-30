import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="card px-6 py-14 text-center">
      <p className="num text-4xl font-bold text-faint">404</p>
      <p className="mt-2 text-sm text-subtle">Такої сторінки немає.</p>
      <Link to="/" className="btn-ghost mt-6">
        На головну
      </Link>
    </div>
  );
}
