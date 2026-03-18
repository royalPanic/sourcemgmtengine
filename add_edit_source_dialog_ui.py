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
    QSizePolicy, QVBoxLayout, QWidget)

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

        self.label_2 = QLabel(SourceDialog)
        self.label_2.setObjectName(u"label_2")

        self.formLayout.setWidget(1, QFormLayout.ItemRole.LabelRole, self.label_2)

        self.cboSourceType = QComboBox(SourceDialog)
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.addItem("")
        self.cboSourceType.setObjectName(u"cboSourceType")
        self.cboSourceType.setEditable(True)

        self.formLayout.setWidget(1, QFormLayout.ItemRole.FieldRole, self.cboSourceType)

        self.label_3 = QLabel(SourceDialog)
        self.label_3.setObjectName(u"label_3")

        self.formLayout.setWidget(2, QFormLayout.ItemRole.LabelRole, self.label_3)

        self.cboReliability = QComboBox(SourceDialog)
        self.cboReliability.setObjectName(u"cboReliability")

        self.formLayout.setWidget(2, QFormLayout.ItemRole.FieldRole, self.cboReliability)

        self.label_4 = QLabel(SourceDialog)
        self.label_4.setObjectName(u"label_4")

        self.formLayout.setWidget(3, QFormLayout.ItemRole.LabelRole, self.label_4)

        self.cboCredibility = QComboBox(SourceDialog)
        self.cboCredibility.setObjectName(u"cboCredibility")

        self.formLayout.setWidget(3, QFormLayout.ItemRole.FieldRole, self.cboCredibility)

        self.label_5 = QLabel(SourceDialog)
        self.label_5.setObjectName(u"label_5")

        self.formLayout.setWidget(4, QFormLayout.ItemRole.LabelRole, self.label_5)

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

        self.formLayout.setLayout(4, QFormLayout.ItemRole.FieldRole, self.tagInputLayout)

        self.tagListLayout = QHBoxLayout()
        self.tagListLayout.setObjectName(u"tagListLayout")
        self.listTags = QListWidget(SourceDialog)
        self.listTags.setObjectName(u"listTags")
        self.listTags.setMaximumSize(QSize(16777215, 100))

        self.tagListLayout.addWidget(self.listTags)

        self.btnRemoveTag = QPushButton(SourceDialog)
        self.btnRemoveTag.setObjectName(u"btnRemoveTag")

        self.tagListLayout.addWidget(self.btnRemoveTag)

        self.formLayout.setLayout(5, QFormLayout.ItemRole.FieldRole, self.tagListLayout)


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
        self.label_2.setText(QCoreApplication.translate("SourceDialog", u"Type:", None))
        self.cboSourceType.setItemText(0, QCoreApplication.translate("SourceDialog", u"Link", None))
        self.cboSourceType.setItemText(1, QCoreApplication.translate("SourceDialog", u"Image", None))
        self.cboSourceType.setItemText(2, QCoreApplication.translate("SourceDialog", u"Video", None))
        self.cboSourceType.setItemText(3, QCoreApplication.translate("SourceDialog", u"Text", None))
        self.cboSourceType.setItemText(4, QCoreApplication.translate("SourceDialog", u"File", None))

        self.label_3.setText(QCoreApplication.translate("SourceDialog", u"Reliability:", None))
        self.label_4.setText(QCoreApplication.translate("SourceDialog", u"Credibility:", None))
        self.label_5.setText(QCoreApplication.translate("SourceDialog", u"Tags:", None))
        self.cboTagInput.lineEdit().setPlaceholderText(QCoreApplication.translate("SourceDialog", u"Select or type a new tag...", None))
        self.btnAddTag.setText(QCoreApplication.translate("SourceDialog", u"Add Tag", None))
        self.btnRemoveTag.setText(QCoreApplication.translate("SourceDialog", u"Remove", None))
    # retranslateUi

