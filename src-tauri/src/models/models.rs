use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A container is either a plain case or a dated event. Events support
/// everything a case does, plus a user-editable date/time.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerKind {
    Case,
    Event,
}

impl ContainerKind {
    pub fn from_db(value: &str) -> Self {
        match value {
            "event" => ContainerKind::Event,
            _ => ContainerKind::Case,
        }
    }

    pub fn as_db(&self) -> &'static str {
        match self {
            ContainerKind::Case => "case",
            ContainerKind::Event => "event",
        }
    }
}

/// How a source bears on the event it belongs to.
///
/// `None` (the absence of a stance) means "none / not applicable" and is the
/// only valid state for sources attached to a plain case.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Stance {
    Supports,
    Refutes,
    Neutral,
}

impl Stance {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "supports" => Some(Stance::Supports),
            "refutes" => Some(Stance::Refutes),
            "neutral" => Some(Stance::Neutral),
            _ => None,
        }
    }

    pub fn as_db(&self) -> &'static str {
        match self {
            Stance::Supports => "supports",
            Stance::Refutes => "refutes",
            Stance::Neutral => "neutral",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Case {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub kind: ContainerKind,
    pub event_date: Option<String>,
    pub event_time: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaseNote {
    pub id: String,
    pub case_id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "PascalCase")]
pub enum SourceType {
    #[serde(rename = "URL")]
    Url,
    Document,
    #[serde(rename = "Social Media")]
    SocialMedia,
    Image,
    Video,
    Audio,
    Other,
}

impl SourceType {
    /// Parse a value stored in the `sources.source_type` column.
    pub fn from_db(value: &str) -> Self {
        match value {
            "URL" => SourceType::Url,
            "Document" => SourceType::Document,
            "Social Media" | "SocialMedia" => SourceType::SocialMedia,
            "Image" => SourceType::Image,
            "Video" => SourceType::Video,
            "Audio" => SourceType::Audio,
            _ => SourceType::Other,
        }
    }

    pub fn as_db(&self) -> &'static str {
        match self {
            SourceType::Url => "URL",
            SourceType::Document => "Document",
            SourceType::SocialMedia => "Social Media",
            SourceType::Image => "Image",
            SourceType::Video => "Video",
            SourceType::Audio => "Audio",
            SourceType::Other => "Other",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Source {
    pub id: String,
    pub case_id: String,
    pub title: String,
    pub source_type: SourceType,
    pub url: Option<String>,
    pub raw_text: Option<String>,
    pub reliability_code: Option<String>,
    pub credibility_code: Option<i32>,
    pub stance: Option<Stance>,
    pub custom_metadata: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceAttachment {
    pub id: String,
    pub source_id: String,
    pub file_name: String,
    pub relative_path: String,
    pub mime_type: Option<String>,
    pub file_size: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceWithAttachments {
    #[serde(flatten)]
    pub source: Source,
    pub attachments: Vec<SourceAttachment>,
}

impl Case {
    pub fn new(
        title: String,
        description: Option<String>,
        kind: ContainerKind,
        event_date: Option<String>,
        event_time: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description,
            kind,
            event_date,
            event_time,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl CaseNote {
    pub fn new(case_id: String, content: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            case_id,
            content,
            updated_at: now,
        }
    }
}

impl Source {
    pub fn new(
        case_id: String,
        title: String,
        source_type: SourceType,
        url: Option<String>,
        raw_text: Option<String>,
        reliability_code: Option<String>,
        credibility_code: Option<i32>,
        stance: Option<Stance>,
        custom_metadata: serde_json::Value,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            case_id,
            title,
            source_type,
            url,
            raw_text,
            reliability_code,
            credibility_code,
            stance,
            custom_metadata: custom_metadata.to_string(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl SourceAttachment {
    pub fn new(
        source_id: String,
        file_name: String,
        relative_path: String,
        mime_type: Option<String>,
        file_size: Option<i64>,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            source_id,
            file_name,
            relative_path,
            mime_type,
            file_size,
            created_at: now,
        }
    }
}