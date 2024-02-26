use crate::error::ResultSingle;
use crate::types::{EpicboxAddress, Slate};

pub trait EpicboxPublisher {
    fn post_slate(&self, slate: &Slate, to: &EpicboxAddress) -> ResultSingle<()>;
}
