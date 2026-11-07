import axios from 'axios';

const suggestReorder = async (orderHistory, menuItems) => {
    const response = await axios.post(
        `${process.env.AI_SERVICE_URL}/suggest-reorder`,
        {
            orderHistory,
            menuItems
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data;
};

export { suggestReorder };