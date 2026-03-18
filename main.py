import sys
import datetime
import json
from PySide6.QtCore import Qt, QDateTime
from PySide6.QtWidgets import (QApplication, QMainWindow, QMessageBox, QDialog, 
                               QTreeWidgetItem, QHeaderView, QTableWidgetItem)

from engine_db import SourceManagerDB
from main_window_ui import Ui_MainWindow
from edit_topic_dialog_ui import Ui_EditTopicDialog
from add_edit_source_dialog_ui import Ui_SourceDialog

# --- Constants for NATO Codes ---
RELIABILITY_MAP = {
    "A: Completely reliable": 5,
    "B: Usually reliable": 4,
    "C: Fairly reliable": 3,
    "D: Not usually reliable": 2,
    "E: Unreliable": 1,
    "F: Cannot be judged": 0
}
RELIABILITY_MAP_REV = {v: k for k, v in RELIABILITY_MAP.items()}

CREDIBILITY_MAP = {
    "1: Confirmed by other sources": 5,
    "2: Probably true": 4,
    "3: Possibly true": 3,
    "4: Doubtful": 2,
    "5: Improbable": 1,
    "6: Cannot be judged": 0
}
CREDIBILITY_MAP_REV = {v: k for k, v in CREDIBILITY_MAP.items()}
# ---------------------------------

class EditTopicDialog(QDialog, Ui_EditTopicDialog):
    def __init__(self, topic_data, all_groups, parent=None):
        super().__init__(parent)
        self.setupUi(self)
        # ... (rest of the class is unchanged)
        self.topic_id, old_title, old_group, old_event_date_str = topic_data
        self.txtEditTitle.setText(old_title)
        self.cboEditGroup.addItems(all_groups)
        if old_group in all_groups: self.cboEditGroup.setCurrentText(old_group)
        py_datetime = datetime.datetime.fromisoformat(old_event_date_str)
        self.dtEditEventDate.setDateTime(QDateTime(py_datetime))
        self.chkEditEnableTime.setChecked(py_datetime.time() != datetime.time(0, 0))
        self.chkEditEnableTime.stateChanged.connect(self.toggle_time_display)
        self.toggle_time_display(self.chkEditEnableTime.checkState())

    def toggle_time_display(self, state):
        self.dtEditEventDate.setDisplayFormat("yyyy-MM-dd HH:mm:ss" if state == Qt.CheckState.Checked else "yyyy-MM-dd")

    def get_data(self):
        return (self.txtEditTitle.text().strip(),
                self.cboEditGroup.currentText().strip(),
                self.dtEditEventDate.dateTime().toString(Qt.ISODate))

class SourceDialog(QDialog, Ui_SourceDialog):
    def __init__(self, source_data=None, existing_tags=None, parent=None):
        super().__init__(parent)
        self.setupUi(self)

        # Populate combo boxes
        self.cboReliability.addItems(RELIABILITY_MAP.keys())
        self.cboCredibility.addItems(CREDIBILITY_MAP.keys())

        # Populate the tag combo box with existing tags from the database
        if existing_tags:
            self.cboTagInput.addItems(existing_tags)
        self.cboTagInput.setCurrentText("")

        # Connect tag buttons
        self.btnAddTag.clicked.connect(self.handle_add_tag)
        self.btnRemoveTag.clicked.connect(self.handle_remove_tag)

        if source_data:
            _, uri, type, reliability, credibility, metadata_str = source_data
            self.txtSourceURI.setText(uri)
            self.cboSourceType.setCurrentText(type)
            self.cboReliability.setCurrentText(RELIABILITY_MAP_REV.get(reliability, "F: Cannot be judged"))
            self.cboCredibility.setCurrentText(CREDIBILITY_MAP_REV.get(credibility, "6: Cannot be judged"))

            # Load tags from JSON into the list widget
            try:
                metadata = json.loads(metadata_str)
                for tag in metadata.get("tags", []):
                    if tag.strip():
                        self.listTags.addItem(tag.strip())
            except (json.JSONDecodeError, TypeError):
                pass

    def handle_add_tag(self):
        tag = self.cboTagInput.currentText().strip()
        if not tag:
            return
        # Prevent duplicate tags
        for i in range(self.listTags.count()):
            if self.listTags.item(i).text() == tag:
                return
        self.listTags.addItem(tag)
        # Add new tag to the combo box dropdown if it's not already there
        if self.cboTagInput.findText(tag) == -1:
            self.cboTagInput.addItem(tag)
        self.cboTagInput.setCurrentText("")

    def handle_remove_tag(self):
        current_item = self.listTags.currentItem()
        if current_item:
            self.listTags.takeItem(self.listTags.row(current_item))

    def get_data(self):
        uri = self.txtSourceURI.text().strip()
        source_type = self.cboSourceType.currentText()
        reliability = RELIABILITY_MAP[self.cboReliability.currentText()]
        credibility = CREDIBILITY_MAP[self.cboCredibility.currentText()]

        # Collect tags from the list widget
        tags = []
        for i in range(self.listTags.count()):
            tags.append(self.listTags.item(i).text())
        metadata = {"tags": tags}

        if not uri:
            QMessageBox.warning(self, "Input Error", "The URI / Info field cannot be empty.")
            return None

        return uri, source_type, reliability, credibility, json.dumps(metadata)

class SourceEngineApp(QMainWindow, Ui_MainWindow):
    def __init__(self):
        super().__init__()
        self.setupUi(self)
        self.db = SourceManagerDB()

        # Connections
        self.btnAddTopic.clicked.connect(self.handle_add_topic)
        self.btnDeleteTopic.clicked.connect(self.handle_delete_topic)
        self.btnEditTopic.clicked.connect(self.handle_edit_topic)
        self.chkEnableTime.stateChanged.connect(self.toggle_time_display)
        self.treeTopics.currentItemChanged.connect(self.handle_topic_selection_changed)
        self.btnAddSource.clicked.connect(self.handle_add_source)
        self.btnEditSource.clicked.connect(self.handle_edit_source)
        self.btnDeleteSource.clicked.connect(self.handle_delete_source)

        # Initial UI State
        self.splitter.setSizes([300, 700])
        self.treeTopics.header().setSectionResizeMode(QHeaderView.ResizeToContents)
        self.tableSources.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.dtEventDate.setDateTime(QDateTime.currentDateTime())
        self.toggle_time_display(self.chkEnableTime.checkState())
        self.rightPanel.setEnabled(False)

        self.refresh_topic_tree()

    # --- Topic Methods ---
    def toggle_time_display(self, state):
        self.dtEventDate.setDisplayFormat("yyyy-MM-dd HH:mm:ss" if state == Qt.CheckState.Checked else "yyyy-MM-dd")

    def handle_add_topic(self):
        title = self.txtTopicTitle.text().strip()
        if not title: return
        group_name = self.txtGroupName.text().strip()
        event_date = self.dtEventDate.dateTime().toString(Qt.ISODate)
        self.db.add_topic(title, group_name, event_date)
        self.txtTopicTitle.clear()
        self.txtGroupName.clear()
        self.refresh_topic_tree()

    def refresh_topic_tree(self):
        current_topic_id, _, _, _ = self.get_selected_topic_info()
        self.treeTopics.clear()
        
        topics = self.db.get_all_topics()
        groups = {}
        for topic_id, title, group_name, event_date in topics:
            if group_name not in groups: groups[group_name] = []
            groups[group_name].append((topic_id, title, event_date))
            
        for group_name, topic_list in sorted(groups.items()):
            group_item = QTreeWidgetItem(self.treeTopics, [group_name])
            for topic_id, title, event_date in topic_list:
                date_obj = datetime.datetime.fromisoformat(event_date)
                formatted_date = date_obj.strftime("%Y-%m-%d" if date_obj.time() == datetime.time(0, 0) else "%Y-%m-%d %H:%M")
                topic_item = QTreeWidgetItem(group_item, [title, formatted_date])
                topic_item.setData(0, Qt.UserRole, topic_id)
                topic_item.setData(0, Qt.UserRole + 1, event_date)
                if topic_id == current_topic_id:
                    self.treeTopics.setCurrentItem(topic_item)
            self.treeTopics.expandAll()

    def get_selected_topic_info(self):
        item = self.treeTopics.currentItem()
        if not item or not item.parent(): return None, None, None, None
        return (item.data(0, Qt.UserRole),
                item.text(0),
                item.parent().text(0),
                item.data(0, Qt.UserRole + 1))

    def handle_delete_topic(self):
        topic_id, _, _, _ = self.get_selected_topic_info()
        if not topic_id: return
        confirm = QMessageBox.question(self, "Confirm Delete", f"Are you sure you want to delete this topic and all its sources?")
        if confirm == QMessageBox.Yes:
            self.db.delete_topic(topic_id)
            self.refresh_topic_tree()
            self.handle_topic_selection_changed(None, None)

    def handle_edit_topic(self):
        topic_info = self.get_selected_topic_info()
        if not topic_info[0]: return
        dialog = EditTopicDialog(topic_info, self.db.get_all_group_names(), self)
        if dialog.exec() == QDialog.Accepted:
            new_title, new_group, new_event_date = dialog.get_data()
            if new_title:
                self.db.update_topic(topic_info[0], new_title, new_group, new_event_date)
                self.refresh_topic_tree()

    # --- Source Methods ---
    def handle_topic_selection_changed(self, current, previous):
        topic_id, title, _, _ = self.get_selected_topic_info()
        if topic_id:
            self.rightPanel.setEnabled(True)
            self.lblSourcesFor.setText(f"Sources for: {title}")
            self.refresh_source_table()
        else:
            self.rightPanel.setEnabled(False)
            self.lblSourcesFor.setText("Sources for: (No topic selected)")
            self.tableSources.setRowCount(0)
    
    def refresh_source_table(self):
        topic_id, _, _, _ = self.get_selected_topic_info()
        if not topic_id: return

        self.tableSources.setRowCount(0)
        sources = self.db.get_sources_for_topic(topic_id)
        self.tableSources.setRowCount(len(sources))

        for row, source in enumerate(sources):
            source_id, uri, type, reliability, credibility, metadata_str = source
            
            uri_item = QTableWidgetItem(uri)
            uri_item.setData(Qt.UserRole, source_id)
            
            self.tableSources.setItem(row, 0, uri_item)
            self.tableSources.setItem(row, 1, QTableWidgetItem(type))
            self.tableSources.setItem(row, 2, QTableWidgetItem(RELIABILITY_MAP_REV.get(reliability)))
            self.tableSources.setItem(row, 3, QTableWidgetItem(CREDIBILITY_MAP_REV.get(credibility)))

            # Display tags in the Tags column
            tags_display = ""
            try:
                metadata = json.loads(metadata_str)
                tags_display = ", ".join(metadata.get("tags", []))
            except (json.JSONDecodeError, TypeError):
                pass
            self.tableSources.setItem(row, 4, QTableWidgetItem(tags_display))

    def handle_add_source(self):
        topic_id, _, _, _ = self.get_selected_topic_info()
        if not topic_id: return
        
        dialog = SourceDialog(existing_tags=self.db.get_all_tags(), parent=self)
        if dialog.exec() == QDialog.Accepted:
            data = dialog.get_data()
            if data:
                uri, source_type, reliability, credibility, metadata = data
                self.db.add_source(topic_id, uri, source_type, reliability, credibility, metadata)
                self.refresh_source_table()

    def handle_edit_source(self):
        current_row = self.tableSources.currentRow()
        if current_row < 0: return

        source_id = self.tableSources.item(current_row, 0).data(Qt.UserRole)
        # We need the full source record to pass to the dialog
        sources = self.db.get_sources_for_topic(self.get_selected_topic_info()[0])
        source_data = next((s for s in sources if s[0] == source_id), None)
        if not source_data: return

        dialog = SourceDialog(source_data=source_data, existing_tags=self.db.get_all_tags(), parent=self)
        if dialog.exec() == QDialog.Accepted:
            data = dialog.get_data()
            if data:
                uri, source_type, reliability, credibility, metadata = data
                self.db.update_source(source_id, uri, source_type, reliability, credibility, metadata)
                self.refresh_source_table()

    def handle_delete_source(self):
        current_row = self.tableSources.currentRow()
        if current_row < 0: return

        source_id = self.tableSources.item(current_row, 0).data(Qt.UserRole)
        confirm = QMessageBox.question(self, "Confirm Delete", "Are you sure you want to delete this source?")
        if confirm == QMessageBox.Yes:
            self.db.delete_source(source_id)
            self.refresh_source_table()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SourceEngineApp()
    window.show()
    sys.exit(app.exec())
