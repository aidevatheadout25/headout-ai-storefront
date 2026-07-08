import type { ScaffoldResult } from "@/lib/api";

type Props = {
  scaffold: ScaffoldResult;
};

export function ScaffoldCard({ scaffold }: Props) {
  return (
    <div className="scaffold-card">
      <div className="scaffold-card__header">
        <span className="scaffold-card__badge t-label-xs">SIMULATED</span>
        <span className="scaffold-card__title t-heading-sm">Repo created</span>
      </div>
      <a
        href={scaffold.repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="scaffold-card__url t-para-sm"
      >
        {scaffold.repoUrl}
      </a>
      <div className="scaffold-card__contents">
        <p className="scaffold-card__contents-label t-label-sm">What's inside:</p>
        <ul className="scaffold-card__files">
          {scaffold.contents.map((file) => (
            <li key={file} className="scaffold-card__file t-para-sm">
              <span className="scaffold-card__file-icon" aria-hidden="true">📄</span>
              {file}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
