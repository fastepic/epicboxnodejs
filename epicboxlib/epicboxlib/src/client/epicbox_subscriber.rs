use crate::error::ResultSingle;
use crate::client::EpicboxSubscriptionHandler;

pub trait EpicboxSubscriber {
    fn subscribe(&mut self, handler: Box<dyn EpicboxSubscriptionHandler + Send>) -> ResultSingle<()>;
    fn unsubscribe(&self);
    fn is_running(&self) -> bool;
}
