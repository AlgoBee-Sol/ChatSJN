ALTER TABLE chunks ADD COLUMN searchText TEXT NOT NULL DEFAULT '';
CREATE VIRTUAL TABLE chunk_search USING fts5(searchText, content='chunks', content_rowid='rowid', tokenize='unicode61 remove_diacritics 0');
UPDATE chunks SET searchText=json_extract(data,'$.originalText');
INSERT INTO chunk_search(chunk_search) VALUES('rebuild');
