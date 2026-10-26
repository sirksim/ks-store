CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT,
  revision INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  op_id TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT,
  revision INTEGER NOT NULL,
  deleted INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS shares_document ON shares(kind, id);
CREATE TRIGGER IF NOT EXISTS record_insert AFTER INSERT ON records BEGIN
  INSERT INTO changes(op_id,kind,id,payload,revision,deleted)
  VALUES(NEW.op_id,NEW.kind,NEW.id,NEW.payload,NEW.revision,NEW.deleted);
END;
CREATE TRIGGER IF NOT EXISTS record_update AFTER UPDATE ON records BEGIN
  INSERT INTO changes(op_id,kind,id,payload,revision,deleted)
  VALUES(NEW.op_id,NEW.kind,NEW.id,NEW.payload,NEW.revision,NEW.deleted);
END;
INSERT OR IGNORE INTO meta(key,value) VALUES('epoch',lower(hex(randomblob(16))));
INSERT OR IGNORE INTO records(kind,id,payload,revision,deleted,op_id)
VALUES('settings','main','{"margin":30,"priceStep":25}',1,0,'initial-settings');
