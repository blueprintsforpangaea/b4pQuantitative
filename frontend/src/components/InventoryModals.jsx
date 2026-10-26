import { formatCurrency, formatNumber } from "../lib/format.js";

export function InventoryDetailsModal({
  detailsItem,
  setDetailsItem,
}) {
  function closeDetailsModal() {
    setDetailsItem(null);
  }

  return (
    <>
      {detailsItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDetailsModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Supply Details</p>
                <h2 id="details-modal-title">Supply #{detailsItem.supplyId}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDetailsModal}>
                x
              </button>
            </div>

            <div className="details-grid">
              <div className="details-item"><span>Supply ID</span><strong>{detailsItem.supplyId}</strong></div>
              <div className="details-item"><span>Days in Warehouse</span><strong>{formatNumber(detailsItem.daysInWarehouse)}</strong></div>
              <div className="details-item"><span>Manufacturer Name</span><strong>{detailsItem.manufacturer}</strong></div>
              <div className="details-item"><span>Category</span><strong>{detailsItem.category}</strong></div>
              <div className="details-item"><span>General</span><strong>{detailsItem.generalSupply}</strong></div>
              <div className="details-item"><span>Name</span><strong>{detailsItem.exactSupplyName}</strong></div>
              <div className="details-item"><span>Location Information</span><strong>{detailsItem.locationInfo}</strong></div>
              <div className="details-item"><span>Quantity</span><strong>{formatNumber(detailsItem.quantity)}</strong></div>
              <div className="details-item"><span>Price per Unit</span><strong>{formatCurrency(detailsItem.unitPrice)}</strong></div>
              <div className="details-item"><span>Total Price</span><strong>{formatCurrency(detailsItem.valuation)}</strong></div>
              <div className="details-item"><span>Expiration Date</span><strong>{detailsItem.expirationDate}</strong></div>
              <div className="details-item">
                <span>Image URL</span>
                <strong>
                  {detailsItem.imageUrl ? (
                    <a href={detailsItem.imageUrl} target="_blank" rel="noreferrer">
                      Open image link
                    </a>
                  ) : (
                    "Not available"
                  )}
                </strong>
              </div>
            </div>

            {detailsItem.imageUrl ? (
              <div className="details-image-wrap">
                <img className="details-image" src={detailsItem.imageUrl} alt={detailsItem.exactSupplyName} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
