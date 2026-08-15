import React, { useMemo } from 'react';
import AppSelect from './AppSelect';
import { PAYEE_BANK_OTHER, payeeBankOptions } from '../utils/payeeBanks';

export default function PayeeBankSelect({
  value = '',
  onChange,
  extraBanks = [],
  id,
  'aria-label': ariaLabel = 'Payee bank name',
}) {
  const extraKey = extraBanks.join('\0');
  const options = useMemo(
    () => payeeBankOptions(extraBanks),
    // extraBanks identity is captured via extraKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraKey]
  );

  const stored = String(value || '').trim();
  const listed = options.some((o) => o.value && o.value !== PAYEE_BANK_OTHER && o.value === stored);
  const selectValue = !stored ? '' : listed ? stored : PAYEE_BANK_OTHER;

  return (
    <>
      <AppSelect
        id={id}
        value={selectValue}
        onChange={(next) => {
          if (next === PAYEE_BANK_OTHER) {
            onChange(listed ? '' : stored);
            return;
          }
          onChange(next);
        }}
        options={options}
        placeholder="Select bank…"
        aria-label={ariaLabel}
      />
      {selectValue === PAYEE_BANK_OTHER && (
        <input
          className="form-input"
          type="text"
          style={{ marginTop: '0.45rem' }}
          placeholder="Type bank name"
          value={stored}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}
    </>
  );
}
