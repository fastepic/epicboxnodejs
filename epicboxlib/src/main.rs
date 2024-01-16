extern crate epicboxlib;

use epicboxlib::error::{Error, ResultSingle};
use epicboxlib::types::{EpicboxAddress, EpicboxError};
use epicboxlib::utils::crypto::{verify_signature, Base58, Hex};
use epicboxlib::utils::secp::{PublicKey, Signature};

use std::env;

fn main() {
	let args: Vec<String> = env::args().collect();

	let verifysignature: &str = "verifysignature";
	let verifyaddress: &str = "verifyaddress";

	if verifysignature.eq(args[1].as_str()) {
		let answer =
			match verify_signature_main(args[2].as_str(), args[3].as_str(), args[4].as_str()) {
				Ok(_answer) => true,
				Err(_e) => false,
			};

		print!("{}", answer);
	} else if verifyaddress.eq(args[1].as_str()) {
		let mut fromok = true;
		let mut took = true;
		let from_address = EpicboxAddress::from_str_raw(&args[2]);
		if from_address.is_err() {
			fromok = false;
		}

		let to_address = EpicboxAddress::from_str_raw(&args[3]);
		if to_address.is_err() {
			took = false
		}
		print!("{}", (fromok && took));
	} else {
		print!("{}", false);
	}
}

fn verify_signature_main(public_key: &str, challenge: &str, signature: &str) -> ResultSingle<()> {
	let (public_key, _) = PublicKey::from_base58_check_raw(public_key, 2)?;
	let signature = Signature::from_hex(signature)?;
	verify_signature(challenge, &signature, &public_key)
		.map_err(|_| Error::EpicboxProtocolError(EpicboxError::InvalidSignature))?;
	Ok(())
}
