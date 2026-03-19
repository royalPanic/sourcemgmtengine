import sqlite3
import json
import datetime

class SourceManagerDB:
    def __init__(self, db_name="engine_data.db"):
        self.conn = sqlite3.connect(db_name)
        # Enable foreign key support for cascading deletes
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self._create_tables()
        self._update_schema()

    def _create_tables(self):
        query = """
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER,
            uri TEXT,
            type TEXT,
            reliability INTEGER, -- NATO A-F (mapped to 5-0)
            credibility INTEGER, -- NATO 1-6 (mapped to 5-0)
            metadata TEXT,       -- Store arbitrary data as JSON
            FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
        );
        """
        self.conn.executescript(query)

    def _update_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA table_info(topics)")
        columns = [info[1] for info in cursor.fetchall()]

        if 'group_name' not in columns:
            cursor.execute("ALTER TABLE topics ADD COLUMN group_name TEXT DEFAULT 'Uncategorized'")
        
        if 'creation_date' in columns:
            # Rename 'creation_date' to 'event_date' for backward compatibility
            cursor.execute("ALTER TABLE topics RENAME COLUMN creation_date TO event_date")
        elif 'event_date' not in columns:
            now = datetime.datetime.now().isoformat()
            cursor.execute("ALTER TABLE topics ADD COLUMN event_date TEXT")
            cursor.execute("UPDATE topics SET event_date = ? WHERE event_date IS NULL", (now,))

        # Add stance column to sources if it doesn't exist
        cursor.execute("PRAGMA table_info(sources)")
        source_columns = [info[1] for info in cursor.fetchall()]
        if 'stance' not in source_columns:
            cursor.execute("ALTER TABLE sources ADD COLUMN stance TEXT DEFAULT 'Supports'")
        if 'description' not in source_columns:
            cursor.execute("ALTER TABLE sources ADD COLUMN description TEXT DEFAULT ''")
        
        self.conn.commit()

    # Topic Methods
    def add_topic(self, title, group_name, event_date):
        cursor = self.conn.cursor()
        if not group_name or not group_name.strip():
            group_name = "Uncategorized"
        cursor.execute("INSERT INTO topics (title, group_name, event_date) VALUES (?, ?, ?)",
                       (title, group_name, event_date))
        self.conn.commit()
        return cursor.lastrowid

    def get_all_topics(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, title, group_name, event_date FROM topics ORDER BY group_name, title")
        return cursor.fetchall()

    def get_all_group_names(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT DISTINCT group_name FROM topics ORDER BY group_name")
        return [row[0] for row in cursor.fetchall()]

    def delete_topic(self, topic_id):
        # With ON DELETE CASCADE, sources are deleted automatically
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
        self.conn.commit()

    def update_topic(self, topic_id, new_title, new_group_name, new_event_date):
        cursor = self.conn.cursor()
        if not new_group_name or not new_group_name.strip():
            new_group_name = "Uncategorized"
        cursor.execute("UPDATE topics SET title = ?, group_name = ?, event_date = ? WHERE id = ?",
                       (new_title, new_group_name, new_event_date, topic_id))
        self.conn.commit()

    # Source Methods
    def add_source(self, topic_id, uri, source_type, reliability, credibility, metadata='{}', stance='Supports', description=''):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO sources (topic_id, uri, type, reliability, credibility, metadata, stance, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (topic_id, uri, source_type, reliability, credibility, metadata, stance, description))
        self.conn.commit()
        return cursor.lastrowid

    def get_sources_for_topic(self, topic_id, stance_filter=None):
        cursor = self.conn.cursor()
        if stance_filter and stance_filter != "All":
            cursor.execute("SELECT id, uri, type, reliability, credibility, metadata, stance, description FROM sources WHERE topic_id = ? AND stance = ?", (topic_id, stance_filter))
        else:
            cursor.execute("SELECT id, uri, type, reliability, credibility, metadata, stance, description FROM sources WHERE topic_id = ?", (topic_id,))
        return cursor.fetchall()

    def update_source(self, source_id, uri, source_type, reliability, credibility, metadata, stance='Supports', description=''):
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE sources 
            SET uri = ?, type = ?, reliability = ?, credibility = ?, metadata = ?, stance = ?, description = ?
            WHERE id = ?
        """, (uri, source_type, reliability, credibility, metadata, stance, description, source_id))
        self.conn.commit()

    def get_all_tags(self):
        """Return a sorted list of all unique tags used across all sources."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT metadata FROM sources WHERE metadata IS NOT NULL")
        all_tags = set()
        for (metadata_str,) in cursor.fetchall():
            try:
                metadata = json.loads(metadata_str)
                for tag in metadata.get("tags", []):
                    if tag.strip():
                        all_tags.add(tag.strip())
            except (json.JSONDecodeError, TypeError):
                continue
        return sorted(all_tags)

    def delete_source(self, source_id):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        self.conn.commit()
