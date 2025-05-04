ALTER TABLE salaries
  ADD COLUMN base_amount integer,
  ADD COLUMN variable_amount integer,
  ADD COLUMN last_month_variable integer,
  ADD COLUMN status text DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed')); 