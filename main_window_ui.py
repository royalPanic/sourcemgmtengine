# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'main_window.ui'
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
from PySide6.QtWidgets import (QApplication, QComboBox, QFrame, QHBoxLayout,
    QHeaderView, QLabel, QMainWindow, QPushButton,
    QSizePolicy, QSplitter, QTableWidget, QTableWidgetItem,
    QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget)

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(1024, 768)
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.mainLayout = QHBoxLayout(self.centralwidget)
        self.mainLayout.setObjectName(u"mainLayout")
        self.splitter = QSplitter(self.centralwidget)
        self.splitter.setObjectName(u"splitter")
        self.splitter.setOrientation(Qt.Horizontal)
        self.leftPanel = QWidget(self.splitter)
        self.leftPanel.setObjectName(u"leftPanel")
        self.leftVLayout = QVBoxLayout(self.leftPanel)
        self.leftVLayout.setObjectName(u"leftVLayout")
        self.btnAddTopic = QPushButton(self.leftPanel)
        self.btnAddTopic.setObjectName(u"btnAddTopic")

        self.leftVLayout.addWidget(self.btnAddTopic)

        self.frame = QFrame(self.leftPanel)
        self.frame.setObjectName(u"frame")
        self.frame.setFrameShape(QFrame.StyledPanel)
        self.frame.setFrameShadow(QFrame.Raised)
        self.horizontalLayout = QHBoxLayout(self.frame)
        self.horizontalLayout.setObjectName(u"horizontalLayout")
        self.btnEditTopic = QPushButton(self.frame)
        self.btnEditTopic.setObjectName(u"btnEditTopic")

        self.horizontalLayout.addWidget(self.btnEditTopic)

        self.btnDeleteTopic = QPushButton(self.frame)
        self.btnDeleteTopic.setObjectName(u"btnDeleteTopic")

        self.horizontalLayout.addWidget(self.btnDeleteTopic)


        self.leftVLayout.addWidget(self.frame)

        self.treeTopics = QTreeWidget(self.leftPanel)
        self.treeTopics.setObjectName(u"treeTopics")

        self.leftVLayout.addWidget(self.treeTopics)

        self.splitter.addWidget(self.leftPanel)
        self.rightPanel = QWidget(self.splitter)
        self.rightPanel.setObjectName(u"rightPanel")
        self.rightVLayout = QVBoxLayout(self.rightPanel)
        self.rightVLayout.setObjectName(u"rightVLayout")
        self.lblSourcesFor = QLabel(self.rightPanel)
        self.lblSourcesFor.setObjectName(u"lblSourcesFor")

        self.rightVLayout.addWidget(self.lblSourcesFor)

        self.filterLayout = QHBoxLayout()
        self.filterLayout.setObjectName(u"filterLayout")
        self.lblFilterStance = QLabel(self.rightPanel)
        self.lblFilterStance.setObjectName(u"lblFilterStance")

        self.filterLayout.addWidget(self.lblFilterStance)

        self.cboFilterStance = QComboBox(self.rightPanel)
        self.cboFilterStance.addItem("")
        self.cboFilterStance.addItem("")
        self.cboFilterStance.addItem("")
        self.cboFilterStance.addItem("")
        self.cboFilterStance.setObjectName(u"cboFilterStance")

        self.filterLayout.addWidget(self.cboFilterStance)


        self.rightVLayout.addLayout(self.filterLayout)

        self.tableSources = QTableWidget(self.rightPanel)
        if (self.tableSources.columnCount() < 8):
            self.tableSources.setColumnCount(8)
        __qtablewidgetitem = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(0, __qtablewidgetitem)
        __qtablewidgetitem1 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(1, __qtablewidgetitem1)
        __qtablewidgetitem2 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(2, __qtablewidgetitem2)
        __qtablewidgetitem3 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(3, __qtablewidgetitem3)
        __qtablewidgetitem4 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(4, __qtablewidgetitem4)
        __qtablewidgetitem5 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(5, __qtablewidgetitem5)
        __qtablewidgetitem6 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(6, __qtablewidgetitem6)
        __qtablewidgetitem7 = QTableWidgetItem()
        self.tableSources.setHorizontalHeaderItem(7, __qtablewidgetitem7)
        self.tableSources.setObjectName(u"tableSources")
        self.tableSources.verticalHeader().setVisible(False)

        self.rightVLayout.addWidget(self.tableSources)

        self.sourceBtnLayout = QHBoxLayout()
        self.sourceBtnLayout.setObjectName(u"sourceBtnLayout")
        self.btnAddSource = QPushButton(self.rightPanel)
        self.btnAddSource.setObjectName(u"btnAddSource")

        self.sourceBtnLayout.addWidget(self.btnAddSource)

        self.btnEditSource = QPushButton(self.rightPanel)
        self.btnEditSource.setObjectName(u"btnEditSource")

        self.sourceBtnLayout.addWidget(self.btnEditSource)

        self.btnDeleteSource = QPushButton(self.rightPanel)
        self.btnDeleteSource.setObjectName(u"btnDeleteSource")

        self.sourceBtnLayout.addWidget(self.btnDeleteSource)


        self.rightVLayout.addLayout(self.sourceBtnLayout)

        self.splitter.addWidget(self.rightPanel)

        self.mainLayout.addWidget(self.splitter)

        MainWindow.setCentralWidget(self.centralwidget)

        self.retranslateUi(MainWindow)

        QMetaObject.connectSlotsByName(MainWindow)
    # setupUi

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"Source Management Engine", None))
        self.btnAddTopic.setText(QCoreApplication.translate("MainWindow", u"Add Topic", None))
        self.btnEditTopic.setText(QCoreApplication.translate("MainWindow", u"Edit", None))
        self.btnDeleteTopic.setText(QCoreApplication.translate("MainWindow", u"Delete", None))
        ___qtreewidgetitem = self.treeTopics.headerItem()
        ___qtreewidgetitem.setText(1, QCoreApplication.translate("MainWindow", u"Event Date", None));
        ___qtreewidgetitem.setText(0, QCoreApplication.translate("MainWindow", u"Topic / Group", None));
        self.lblSourcesFor.setText(QCoreApplication.translate("MainWindow", u"Sources for: (No topic selected)", None))
        self.lblFilterStance.setText(QCoreApplication.translate("MainWindow", u"Filter by Stance:", None))
        self.cboFilterStance.setItemText(0, QCoreApplication.translate("MainWindow", u"All", None))
        self.cboFilterStance.setItemText(1, QCoreApplication.translate("MainWindow", u"Supports", None))
        self.cboFilterStance.setItemText(2, QCoreApplication.translate("MainWindow", u"Rebuts", None))
        self.cboFilterStance.setItemText(3, QCoreApplication.translate("MainWindow", u"Neutral", None))

        ___qtablewidgetitem = self.tableSources.horizontalHeaderItem(0)
        ___qtablewidgetitem.setText(QCoreApplication.translate("MainWindow", u"URI", None));
        ___qtablewidgetitem1 = self.tableSources.horizontalHeaderItem(1)
        ___qtablewidgetitem1.setText(QCoreApplication.translate("MainWindow", u"Description", None));
        ___qtablewidgetitem2 = self.tableSources.horizontalHeaderItem(2)
        ___qtablewidgetitem2.setText(QCoreApplication.translate("MainWindow", u"Type", None));
        ___qtablewidgetitem3 = self.tableSources.horizontalHeaderItem(3)
        ___qtablewidgetitem3.setText(QCoreApplication.translate("MainWindow", u"Reliability", None));
        ___qtablewidgetitem4 = self.tableSources.horizontalHeaderItem(4)
        ___qtablewidgetitem4.setText(QCoreApplication.translate("MainWindow", u"Credibility", None));
        ___qtablewidgetitem5 = self.tableSources.horizontalHeaderItem(5)
        ___qtablewidgetitem5.setText(QCoreApplication.translate("MainWindow", u"Stance", None));
        ___qtablewidgetitem6 = self.tableSources.horizontalHeaderItem(6)
        ___qtablewidgetitem6.setText(QCoreApplication.translate("MainWindow", u"Tags", None));
        ___qtablewidgetitem7 = self.tableSources.horizontalHeaderItem(7)
        ___qtablewidgetitem7.setText(QCoreApplication.translate("MainWindow", u"Media", None));
        self.btnAddSource.setText(QCoreApplication.translate("MainWindow", u"Add Source", None))
        self.btnEditSource.setText(QCoreApplication.translate("MainWindow", u"Edit Source", None))
        self.btnDeleteSource.setText(QCoreApplication.translate("MainWindow", u"Delete Source", None))
    # retranslateUi

