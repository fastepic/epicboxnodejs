use crate::types::EpicboxError;

pub type ResultSingle<T> = std::result::Result<T, Error>;

#[derive(Clone, thiserror::Error, PartialEq, Debug)]
pub enum Error {
    #[error("Generic Error: {}", 0)]
    GenericError(String),
    #[error("Secp error")]
    SecpError(secp256k1zkp::Error),
    #[error("Base58 Error: invalid character!")]
    InvalidBase58Character(char, usize),
    #[error("Base58 Error: invalid length!")]
    InvalidBase58Length,
    #[error("Base58 Error: invalid checksum!")]
    InvalidBase58Checksum,
    #[error("Base58 Error: invalid network!")]
    InvalidBase58Version,
    #[error("Base58 Error: invalid key!")]
    InvalidBase58Key,
    #[error("Could not parse number from string!")]
    NumberParsingError,
    #[error("Could not parse `{}` to a epicbox address!", 0)]
    EpicboxAddressParsingError(String),
    #[error("Encryption Error: unable to encrypt message")]
    Encryption,
    #[error("Decryption Error: unable to decrypt message")]
    Decryption,
    #[error("VerifyProof Error: unable to verify proof")]
    VerifyProof,
    #[error("Websocket Error: epicbox websocket terminated unexpectedly!")]
    EpicboxWebsocketAbnormalTermination,
    #[error("Protocol Error: epicbox protocol error `{}`", 0)]
    EpicboxProtocolError(EpicboxError),
}

impl From<secp256k1zkp::Error> for Error {
        fn from(error: secp256k1zkp::Error) -> Error {
                Error::SecpError(error)
        }
}

