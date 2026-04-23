# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'add_edit_source_dialog.ui'
##
## Created by: Qt User Interface Compiler version 6.10.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QDate, QDateTime, QLocale,
    QMetaObject, QObject, QPoint, QRect,
    QSize, QTime, QUrl, Qt)
from PySide6.QtGui import (QBrush, QColor, QConicalGradient, QCursor,
    QFont, QFontDatabase, QGradient, QIcon,
    QImage, QKeySequence, QLinearGradient, QPainter,
    QPalette, QPixmap, QRadialGradient, QTransform)
from PySide6.QtWidgets import (QAbstractButton, QApplication, QComboBox, QDialog,
    QDialogButtonBox, QFormLayout, QHBoxLayout, QLabel,
    QLineEdit, QListWidget, QListWidgetItem, QPushButton,
    QProgressBar,
    QSizePolicy, QTextEdit, QVBoxLayout, QWidget)

class Ui_SourceDialog(object):
    def setupUi(self, SourceDialog):
        if not SourceDialog.objectName():
            SourceDialog.setObjectName(u"SourceDialog")
        SourceDialog.resize(450, 450)
        self.verticalLayout = QVBoxLayout(SourceDialog)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.formLayout = QFormLayout()
        self.formLayout.setObjectName(u"formLayout")
        self.label = QLabel(SourceDialog)
        self.label.setObjectName(u"label")

        self.formLayout.setWidget(0, QFormLayout.ItemRole.LabelRole, self.label)

        self.txtSourceURI = QLineEdit(SourceDialog)
        self.txtSourceURI.setObjectName(u"txtSourceURI")

        self.formLayout.setWidget(0, QFormLayout.ItemRole.FieldRole, self.txtSourceURI)

        self.label_7 = QLabel(SourceDialog)
        self.label_7.setObjectName(u"label_7")

        self.formLayout.setWidget(1, QFormLayout.ItemRole.LabelRole, self.label_7)

        self.txtDescription = QLineEdit(SourceDialog)
        self.txtDescription.setObjectName(u"txtDescription")

        self.formLayout.setWidget(1, QFormLayout.ItemRole.FieldRole, self.txtDescription)

        self.label_2 = QLabel(SourceDialog)
        self.label_2.setObjectName(u"label_2")

        self.formLayout.setWidget(2, QFormLayout.ItemRole.LabelRole, self.label_2)

        self.cboSourceType = QComboBox(SourceDialog)
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.setObjectName(u"cboSourceType")
        self.cboSourceType.setEditable(True)

        self.formLayout.setWidget(2, QFormLayout.ItemRole.FieldRole, self.cboSourceType)

        self.label_3 = QLabel(SourceDialog)
        self.label_3.setObjectName(u"label_3")

        self.formLayout.setWidget(3, QFormLayout.ItemRole.LabelRole, self.label_3)

        self.cboReliability = QComboBox(SourceDialog)
        self.cboReliability.setObjectName(u"cboReliability")

        self.formLayout.setWidget(3, QFormLayout.ItemRole.FieldRole, self.cboReliability)

        self.label_4 = QLabel(SourceDialog)
        self.label_4.setObjectName(u"label_4")

        self.formLayout.setWidget(4, QFormLayout.ItemRole.LabelRole, self.label_4)

        self.cboCredibility = QComboBox(SourceDialog)
        self.cboCredibility.setObjectName(u"cboCredibility")

        self.formLayout.setWidget(4, QFormLayout.ItemRole.FieldRole, self.cboCredibility)

        self.label_6 = QLabel(SourceDialog)
        self.label_6.setObjectName(u"label_6")

        self.formLayout.setWidget(5, QFormLayout.ItemRole.LabelRole, self.label_6)

        self.cboStance = QComboBox(SourceDialog)
        self.cboStance.addItem("")
        self.cboStance.addItem("")
        self.cboStance.addItem("")
        self.cboStance.setObjectName(u"cboStance")

        self.formLayout.setWidget(5, QFormLayout.ItemRole.FieldRole, self.cboStance)

        self.label_5 = QLabel(SourceDialog)
        self.label_5.setObjectName(u"label_5")

        self.formLayout.setWidget(6, QFormLayout.ItemRole.LabelRole, self.label_5)

        self.tagInputLayout = QHBoxLayout()
        self.tagInputLayout.setObjectName(u"tagInputLayout")
        self.cboTagInput = QComboBox(SourceDialog)
        self.cboTagInput.setObjectName(u"cboTagInput")
        self.cboTagInput.setEditable(True)
        sizePolicy = QSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        sizePolicy.setHorizontalStretch(1)
        sizePolicy.setVerticalStretch(0)
        sizePolicy.setHeightForWidth(self.cboTagInput.sizePolicy().hasHeightForWidth())
        self.cboTagInput.setSizePolicy(sizePolicy)

        self.tagInputLayout.addWidget(self.cboTagInput)

        self.btnAddTag = QPushButton(SourceDialog)
        self.btnAddTag.setObjectName(u"btnAddTag")

        self.tagInputLayout.addWidget(self.btnAddTag)

        self.formLayout.setLayout(6, QFormLayout.ItemRole.FieldRole, self.tagInputLayout)

        self.tagListLayout = QHBoxLayout()
        self.tagListLayout.setObjectName(u"tagListLayout")
        self.listTags = QListWidget(SourceDialog)
        self.listTags.setObjectName(u"listTags")
        self.listTags.setMaximumSize(QSize(16777215, 100))

        self.tagListLayout.addWidget(self.listTags)

        self.btnRemoveTag = QPushButton(SourceDialog)
        self.btnRemoveTag.setObjectName(u"btnRemoveTag")

        self.tagListLayout.addWidget(self.btnRemoveTag)

        self.formLayout.setLayout(7, QFormLayout.ItemRole.FieldRole, self.tagListLayout)

        self.label_8 = QLabel(SourceDialog)
        self.label_8.setObjectName(u"label_8")

        self.formLayout.setWidget(8, QFormLayout.ItemRole.LabelRole, self.label_8)

        self.mediaLayout = QHBoxLayout()
        self.mediaLayout.setObjectName(u"mediaLayout")
        self.txtMediaPath = QLineEdit(SourceDialog)
        self.txtMediaPath.setObjectName(u"txtMediaPath")
        self.txtMediaPath.setReadOnly(True)

        self.mediaLayout.addWidget(self.txtMediaPath)

        self.btnUploadFile = QPushButton(SourceDialog)
        self.btnUploadFile.setObjectName(u"btnUploadFile")

        self.mediaLayout.addWidget(self.btnUploadFile)

        self.btnAttachLink = QPushButton(SourceDialog)
        self.btnAttachLink.setObjectName(u"btnAttachLink")

        self.mediaLayout.addWidget(self.btnAttachLink)

        self.btnDownloadURL = QPushButton(SourceDialog)
        self.btnDownloadURL.setObjectName(u"btnDownloadURL")
        self.mediaLayout.addWidget(self.btnDownloadURL)

        self.progressBar = QProgressBar(SourceDialog)
        self.progressBar.setObjectName(u"progressBar")
        self.progressBar.setVisible(False)
        self.mediaLayout.addWidget(self.progressBar)
        
        self.btnCancelDownload = QPushButton(SourceDialog)
        self.btnCancelDownload.setObjectName(u"btnCancelDownload")
        self.btnCancelDownload.setVisible(False)
        self.mediaLayout.addWidget(self.btnCancelDownload)

        self.formLayout.setLayout(8, QFormLayout.ItemRole.FieldRole, self.mediaLayout)


        self.verticalLayout.addLayout(self.formLayout)

        self.buttonBox = QDialogButtonBox(SourceDialog)
        self.buttonBox.setObjectName(u"buttonBox")
        self.buttonBox.setOrientation(Qt.Horizontal)
        self.buttonBox.setStandardButtons(QDialogButtonBox.Cancel|QDialogButtonBox.Ok)

        self.verticalLayout.addWidget(self.buttonBox)


        self.retranslateUi(SourceDialog)
        self.buttonBox.accepted.connect(SourceDialog.accept)
        self.buttonBox.rejected.connect(SourceDialog.reject)

        QMetaObject.connectSlotsByName(SourceDialog)
    # setupUi

    def retranslateUi(self, SourceDialog):
        SourceDialog.setWindowTitle(QCoreApplication.translate("SourceDialog", u"Add/Edit Source", None))
        self.label.setText(QCoreApplication.translate("SourceDialog", u"URI / Info:", None))
        self.label_7.setText(QCoreApplication.translate("SourceDialog", u"Description:", None))
        self.txtDescription.setPlaceholderText(QCoreApplication.translate("SourceDialog", u"Enter a human-readable title or description...", None))
        self.label_2.setText(QCoreApplication.translate("SourceDialog", u"Type:", None))
        self.cboSourceType.setItemText(0, QCoreApplication.translate("SourceDialog", u"Link", None))
        self.cboSourceType.setItemText(1, QCoreApplication.translate("SourceDialog", u"Image", None))
        self.cboSourceType.setItemText(2, QCoreApplication.translate("SourceDialog", u"Video", None))
        self.cboSourceType.setItemText(3, QCoreApplication.translate("SourceDialog", u"Text", None))
        self.cboSourceType.setItemText(4, QCoreApplication.translate("SourceDialog", u"File", None))

        self.label_3.setText(QCoreApplication.translate("SourceDialog", u"Reliability:", None))
        self.label_4.setText(QCoreApplication.translate("SourceDialog", u"Credibility:", None))
        self.label_6.setText(QCoreApplication.translate("SourceDialog", u"Stance:", None))
        self.cboStance.setItemText(0, QCoreApplication.translate("SourceDialog", u"Supports", None))
        self.cboStance.setItemText(1, QCoreApplication.translate("SourceDialog", u"Rebuts", None))
        self.cboStance.setItemText(2, QCoreApplication.translate("SourceDialog", u"Neutral", None))
        self.label_5.setText(QCoreApplication.translate("SourceDialog", u"Tags:", None))
        self.cboTagInput.lineEdit().setPlaceholderText(QCoreApplication.translate("SourceDialog", u"Select or type a new tag...", None))
        self.btnAddTag.setText(QCoreApplication.translate("SourceDialog", u"Add Tag", None))
        self.btnRemoveTag.setText(QCoreApplication.translate("SourceDialog", u"Remove", None))
        self.label_8.setText(QCoreApplication.translate("SourceDialog", u"Media:", None))
        self.txtMediaPath.setPlaceholderText(QCoreApplication.translate("SourceDialog", u"No media attached", None))
        self.btnUploadFile.setText(QCoreApplication.translate("SourceDialog", u"Upload File", None))
        self.btnAttachLink.setText(QCoreApplication.translate("SourceDialog", u"Attach Link", None))
        self.btnDownloadURL.setText(QCoreApplication.translate("SourceDialog", u"Download URL", None))
        self.progressBar.setFormat(QCoreApplication.translate("SourceDialog", u"%p%", None))
        self.btnCancelDownload.setText(QCoreApplication.translate("SourceDialog", u"Cancel", None))
    # retranslateUi

