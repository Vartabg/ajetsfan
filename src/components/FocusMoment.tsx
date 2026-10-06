import type { ReactNode } from "react";
import styles from "./Focus.module.css";

/**
 * One screen of a focus page: a label, one plain heading, one shape and one action.
 * A moment that hosts a component which is already a labelled section (`hosts`) stays a plain container,
 * so assistive technology hears that section once.
 */
export default function FocusMoment({ id, label, heading, first = false, hosts = false, status, actions, children }: {
  id: string; label?: string; heading?: ReactNode; first?: boolean; hosts?: boolean; status?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const Heading = first ? "h1" : "h2";
  const body = <>
    {status}
    {label ? <p className={styles.label}>{label}</p> : null}
    {heading ? <Heading id={`${id}-heading`} className={styles.say}>{heading}</Heading> : null}
    {children}
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </>;
  return hosts
    ? <div id={id} className={styles.moment} data-focus-moment={id}>{body}</div>
    : <section id={id} className={styles.moment} aria-labelledby={heading ? `${id}-heading` : undefined} data-focus-moment={id}>{body}</section>;
}
