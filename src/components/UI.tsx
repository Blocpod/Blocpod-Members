import {
  ArrowUpRight,
  Bookmark,
  Check,
  LoaderCircle,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { post } from '../lib/api';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M5 3h13l10 7v12L14 30 5 24zm6 7v11l4 2 7-4v-6l-6-3z"
          fill="currentColor"
        />
      </svg>
      <span>
        blocpod<span className="brand-dot">®</span>
      </span>
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={22} className="spin" /> Loading your network…
    </div>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="error-message" role="alert">
      {error}
    </p>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">↗</span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
export const tierNames = ['Operator', 'Builder', 'Founder', 'Foundry'];
export function ResourceArt({
  category,
  variant = 0,
}: {
  category?: string;
  variant?: number;
}) {
  return (
    <div className={`resource-art art-${variant % 4}`} aria-hidden="true">
      <div className="art-coordinate">
        BP / {String(variant + 1).padStart(2, '0')}
      </div>
      <div className="art-shape">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <span>
        {category || 'SYSTEMS'}
        <ArrowUpRight size={18} />
      </span>
    </div>
  );
}
export function ResourceCard({
  resource,
  index = 0,
  onSave,
}: {
  resource: any;
  index?: number;
  onSave?: () => void;
}) {
  const [saved, setSaved] = useState(!!resource.saved);
  const [error, setError] = useState('');
  const save = async () => {
    try {
      const r = await post(`/resources/${resource.id}/save`);
      setSaved(r.saved ?? !saved);
      onSave?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <article className="resource-card">
      <Link
        to={`/app/library/${resource.id}`}
        tabIndex={-1}
        aria-label={`Open ${resource.title}`}
      >
        <ResourceArt category={resource.category} variant={index} />
      </Link>
      <div className="resource-meta">
        <span>{resource.category}</span>
        <span>{tierNames[Number(resource.level ?? 1) - 1] || 'Operator'}</span>
      </div>
      <Link to={`/app/library/${resource.id}`} className="resource-title">
        <h3>{resource.title}</h3>
      </Link>
      <p>{resource.summary}</p>
      <div className="resource-footer">
        <span>
          {resource.reading_minutes || 6} MIN READ
          {resource.demo ? ' · EXAMPLE' : ''}
        </span>
        <button
          className={`icon-button ${saved ? 'saved' : ''}`}
          aria-label={
            saved ? `Unsave ${resource.title}` : `Save ${resource.title}`
          }
          onClick={save}
        >
          {saved ? <Check size={17} /> : <Bookmark size={17} />}
        </button>
      </div>
      <ErrorMessage error={error} />
    </article>
  );
}
export function SectionTitle({
  children,
  to,
  label = 'View all',
}: {
  children: ReactNode;
  to?: string;
  label?: string;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {to && (
        <Link to={to}>
          {label}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`badge status-${value}`}>
      {(value || 'new').replaceAll('_', ' ')}
    </span>
  );
}
export function timeAgo(date: string) {
  const d = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  return d < 60
    ? 'Just now'
    : d < 3600
      ? `${Math.floor(d / 60)}m ago`
      : d < 86400
        ? `${Math.floor(d / 3600)}h ago`
        : new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
}
