-- A confirmed casting participant is tied to the role they were approved for, so
-- the casting can show each role as Filled (and by whom) or still Open. Stays
-- null while a participant is only "interested".
alter table casting_participants add column if not exists role text;
