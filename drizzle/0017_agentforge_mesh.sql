CREATE TABLE IF NOT EXISTS agentforge_events (
  id serial PRIMARY KEY,
  event_id varchar(120) NOT NULL UNIQUE,
  event_type varchar(48) NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS agentforge_events_type_idx ON agentforge_events(event_type, id);

CREATE TABLE IF NOT EXISTS agentforge_task_states (
  task_id varchar(120) PRIMARY KEY,
  state varchar(32) NOT NULL,
  agent_id varchar(120),
  last_event_id varchar(120) NOT NULL,
  error_code varchar(80),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agentforge_tasks_state_idx ON agentforge_task_states(state, updated_at);

CREATE TABLE IF NOT EXISTS agentforge_checkpoints (
  checkpoint_id varchar(64) PRIMARY KEY,
  task_id varchar(120) NOT NULL,
  agent_id varchar(120) NOT NULL,
  sequence integer NOT NULL,
  parent_id varchar(64),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agentforge_checkpoint_sequence_unique UNIQUE(task_id, agent_id, sequence)
);
CREATE INDEX IF NOT EXISTS agentforge_checkpoints_task_idx ON agentforge_checkpoints(task_id, agent_id, sequence);
