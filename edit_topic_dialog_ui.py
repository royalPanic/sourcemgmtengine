# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'edit_topic_dialog.ui'
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
from PySide6.QtWidgets import (QAbstractButton, QApplication, QCheckBox, QComboBox,
    QDateTimeEdit, QDialog, QDialogButtonBox, QFormLayout,
    QLabel, QLineEdit, QSizePolicy, QVBoxLayout,
    QWidget)

class Ui_EditTopicDialog(object):
    def setupUi(self, EditTopicDialog):
        if not EditTopicDialog.objectName():
            EditTopicDialog.setObjectName(u"EditTopicDialog")
        EditTopicDialog.resize(400, 200)
        self.verticalLayout = QVBoxLayout(EditTopicDialog)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.formLayout = QFormLayout()
        self.formLayout.setObjectName(u"formLayout")
        self.lblTitle = QLabel(EditTopicDialog)
        self.lblTitle.setObjectName(u"lblTitle")

        self.formLayout.setWidget(0, QFormLayout.ItemRole.LabelRole, self.lblTitle)

        self.txtEditTitle = QLineEdit(EditTopicDialog)
        self.txtEditTitle.setObjectName(u"txtEditTitle")

        self.formLayout.setWidget(0, QFormLayout.ItemRole.FieldRole, self.txtEditTitle)

        self.lblGroup = QLabel(EditTopicDialog)
        self.lblGroup.setObjectName(u"lblGroup")

        self.formLayout.setWidget(1, QFormLayout.ItemRole.LabelRole, self.lblGroup)

        self.cboEditGroup = QComboBox(EditTopicDialog)
        self.cboEditGroup.setObjectName(u"cboEditGroup")
        self.cboEditGroup.setEditable(True)

        self.formLayout.setWidget(1, QFormLayout.ItemRole.FieldRole, self.cboEditGroup)

        self.lblEventDate = QLabel(EditTopicDialog)
        self.lblEventDate.setObjectName(u"lblEventDate")

        self.formLayout.setWidget(2, QFormLayout.ItemRole.LabelRole, self.lblEventDate)

        self.dtEditEventDate = QDateTimeEdit(EditTopicDialog)
        self.dtEditEventDate.setObjectName(u"dtEditEventDate")

        self.formLayout.setWidget(2, QFormLayout.ItemRole.FieldRole, self.dtEditEventDate)

        self.chkEditEnableTime = QCheckBox(EditTopicDialog)
        self.chkEditEnableTime.setObjectName(u"chkEditEnableTime")

        self.formLayout.setWidget(3, QFormLayout.ItemRole.FieldRole, self.chkEditEnableTime)


        self.verticalLayout.addLayout(self.formLayout)

        self.buttonBox = QDialogButtonBox(EditTopicDialog)
        self.buttonBox.setObjectName(u"buttonBox")
        self.buttonBox.setOrientation(Qt.Horizontal)
        self.buttonBox.setStandardButtons(QDialogButtonBox.Cancel|QDialogButtonBox.Ok)

        self.verticalLayout.addWidget(self.buttonBox)


        self.retranslateUi(EditTopicDialog)
        self.buttonBox.accepted.connect(EditTopicDialog.accept)
        self.buttonBox.rejected.connect(EditTopicDialog.reject)

        QMetaObject.connectSlotsByName(EditTopicDialog)
    # setupUi

    def retranslateUi(self, EditTopicDialog):
        EditTopicDialog.setWindowTitle(QCoreApplication.translate("EditTopicDialog", u"Edit Topic", None))
        self.lblTitle.setText(QCoreApplication.translate("EditTopicDialog", u"Title:", None))
        self.lblGroup.setText(QCoreApplication.translate("EditTopicDialog", u"Group:", None))
        self.lblEventDate.setText(QCoreApplication.translate("EditTopicDialog", u"Event Date:", None))
        self.chkEditEnableTime.setText(QCoreApplication.translate("EditTopicDialog", u"Enable Time", None))
    # retranslateUi

