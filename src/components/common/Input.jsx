import styles from './Input.module.css';

/** Text input with label, optional prefix/suffix, inline error. 52px height. */
export function Input({ label, error, prefix, suffix, textarea = false, hint, className = '', ...rest }) {
  const Tag = textarea ? 'textarea' : 'input';
  return (
    <label className={`${styles.field} ${className}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={`${styles.wrap} ${error ? styles.hasError : ''} ${textarea ? styles.textareaWrap : ''}`}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <Tag className={styles.input} {...rest} />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

/** Horizontal pill selector. options: string[] or {value,label,tone}[] */
export function PillSelect({ options, value, onChange, label, multi = false }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const isSel = (v) => (multi ? value?.includes(v) : value === v);
  const toggle = (v) => {
    if (!multi) return onChange(v);
    onChange(isSel(v) ? value.filter((x) => x !== v) : [...(value ?? []), v]);
  };
  return (
    <div className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.pills}>
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${styles.pill} ${isSel(o.value) ? styles.pillActive : ''}`}
            data-tone={o.tone}
            onClick={() => toggle(o.value)}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Native select styled like Input. */
export function Select({ label, error, options, placeholder, ...rest }) {
  return (
    <label className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={`${styles.wrap} ${error ? styles.hasError : ''}`}>
        <select className={styles.input} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </label>
  );
}

/** iOS-style toggle switch. */
export function Toggle({ checked, onChange, label, description, icon }) {
  return (
    <div className={styles.toggleRow} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      {icon && <span className={styles.toggleIcon}>{icon}</span>}
      <div className="grow">
        <div style={{ fontWeight: 500 }}>{label}</div>
        {description && <div className="hint">{description}</div>}
      </div>
      <div className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}>
        <div className={styles.knob} />
      </div>
    </div>
  );
}
